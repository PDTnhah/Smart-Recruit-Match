// US-1.4 AC-6, AC-7 (GĐ0): campaigns move to the next phase when a deadline passes.
// The clock is fake and set in 2001; these campaigns have 2001 deadlines, every other test file
// keeps its deadlines near the real time, so runOnce() here never moves their campaigns.
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { Clock } from '../../src/common/clock/index.js';
import { ADVISORY_LOCK_KEYS } from '../../src/common/scheduling/advisory-lock.js';
import { CampaignPhaseScheduler } from '../../src/modules/campaign/application/campaign-phase.scheduler.js';
import { CampaignRepository } from '../../src/modules/campaign/infrastructure/campaign.repository.js';
import { CAMPAIGN_PHASE_CHANGED, type CampaignPhaseChangedEvent } from '../../src/modules/campaign/index.js';
import { type AuthTestApp, createAuthTestApp } from '../helpers/auth.js';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createCampaign } from '../helpers/factories.js';
import { FakeClock } from '../helpers/fake-clock.js';
import { auditEntries, readState } from '../helpers/state.js';

const DEADLINES = {
  intake_end: '2001-01-01T00:00:00.000Z',
  preference_end: '2001-01-08T00:00:00.000Z',
  testing_end: '2001-01-15T00:00:00.000Z',
};

describe('GĐ0: campaign phase scheduler (US-1.4)', () => {
  const clock = new FakeClock('2000-12-31T00:00:00.000Z');
  let t: AuthTestApp;
  let scheduler: CampaignPhaseScheduler;
  let testDb: TestDb;
  const phaseChanges: CampaignPhaseChangedEvent[] = [];

  const withFakeClock = {
    configure: (builder: TestingModuleBuilder) => builder.overrideProvider(Clock).useValue(clock),
  };

  beforeAll(async () => {
    t = await createAuthTestApp(withFakeClock);
    scheduler = t.app.get(CampaignPhaseScheduler);
    t.app.get(EventEmitter2).on(CAMPAIGN_PHASE_CHANGED, (event: CampaignPhaseChangedEvent) => phaseChanges.push(event));
    testDb = createTestDb();
  });

  afterAll(async () => {
    await t.close();
    await testDb.close();
  });

  const changesOf = (campaignId: number) => phaseChanges.filter((event) => event.campaignId === campaignId);
  const transitionsOf = async (campaignId: number) =>
    (await auditEntries(t.db, 'campaign', campaignId)).filter((entry) => entry.action === 'TRANSITION');

  it('GĐ0: scheduler transitions by system actor, emits campaign.phase_changed once and is idempotent', async () => {
    const campaign = await createCampaign(t.db, { status: 'INTAKE', rowVersion: 1, phaseDeadlines: DEADLINES });

    clock.set('2000-12-31T23:59:59.999Z');
    expect((await scheduler.runOnce()).transitions.filter((x) => x.campaignId === campaign.id)).toEqual([]);
    expect(await readState(t.db, 'campaign', campaign.id)).toMatchObject({ status: 'INTAKE', rowVersion: 1 });

    clock.set('2001-01-01T00:00:00.000Z');
    const report = await scheduler.runOnce();
    expect(report.acquired).toBe(true);
    expect(report.transitions.filter((x) => x.campaignId === campaign.id)).toEqual([
      { campaignId: campaign.id, from: 'INTAKE', to: 'PREFERENCE_SELECTION' },
    ]);
    expect(await readState(t.db, 'campaign', campaign.id)).toMatchObject({
      status: 'PREFERENCE_SELECTION',
      rowVersion: 2,
    });
    const [entry] = await transitionsOf(campaign.id);
    expect(entry).toMatchObject({
      actorKind: 'SYSTEM',
      actorId: null,
      before: { status: 'INTAKE', rowVersion: 1 },
      after: { status: 'PREFERENCE_SELECTION', rowVersion: 2 },
    });
    expect(entry?.reason).toContain('intake_end');
    expect(changesOf(campaign.id)).toEqual([
      { campaignId: campaign.id, from: 'INTAKE', to: 'PREFERENCE_SELECTION', actorKind: 'SYSTEM' },
    ]);

    // Running again at the same time changes nothing: no transition, audit row or event.
    expect((await scheduler.runOnce()).transitions.filter((x) => x.campaignId === campaign.id)).toEqual([]);
    expect(await transitionsOf(campaign.id)).toHaveLength(1);
    expect(changesOf(campaign.id)).toHaveLength(1);
  });

  it('GĐ0: a campaign several deadlines behind catches up one phase at a time', async () => {
    const campaign = await createCampaign(t.db, { status: 'INTAKE', phaseDeadlines: DEADLINES });
    clock.set('2001-01-20T00:00:00.000Z');
    await scheduler.runOnce();
    expect(await readState(t.db, 'campaign', campaign.id)).toMatchObject({ status: 'ALLOCATION_REVIEW', rowVersion: 3 });
    expect(changesOf(campaign.id).map((event) => `${event.from}->${event.to}`)).toEqual([
      'INTAKE->PREFERENCE_SELECTION',
      'PREFERENCE_SELECTION->TESTING',
      'TESTING->ALLOCATION_REVIEW',
    ]);
    expect((await transitionsOf(campaign.id)).map((entry) => entry.reason)).toEqual([
      expect.stringContaining('testing_end'),
      expect.stringContaining('preference_end'),
      expect.stringContaining('intake_end'),
    ]);
  });

  it('GĐ0: drafts and phases without a deadline never move by themselves', async () => {
    const draft = await createCampaign(t.db, { status: 'DRAFT', phaseDeadlines: DEADLINES });
    const noDeadline = await createCampaign(t.db, { status: 'INTAKE' });
    clock.set('2001-02-01T00:00:00.000Z');
    await scheduler.runOnce();
    expect((await readState(t.db, 'campaign', draft.id)).status).toBe('DRAFT');
    expect((await readState(t.db, 'campaign', noDeadline.id)).status).toBe('INTAKE');
  });

  it('GĐ0: two concurrent scheduler runs produce one transition and one audit row', async () => {
    const other = await createAuthTestApp(withFakeClock);
    try {
      const campaign = await createCampaign(t.db, { status: 'INTAKE', phaseDeadlines: DEADLINES });
      clock.set('2001-01-02T00:00:00.000Z');
      const reports = await Promise.all([scheduler.runOnce(), other.app.get(CampaignPhaseScheduler).runOnce()]);
      const moves = reports.flatMap((report) => report.transitions).filter((x) => x.campaignId === campaign.id);
      expect(moves).toEqual([{ campaignId: campaign.id, from: 'INTAKE', to: 'PREFERENCE_SELECTION' }]);
      expect(await transitionsOf(campaign.id)).toHaveLength(1);
      expect(await readState(t.db, 'campaign', campaign.id)).toMatchObject({ status: 'PREFERENCE_SELECTION', rowVersion: 1 });
    } finally {
      await other.close();
    }
    // Builds a second app; Jest's default 5 s is tight on a cold machine.
  }, 30_000);

  it('GĐ0: a run that cannot take the advisory lock does nothing', async () => {
    const campaign = await createCampaign(t.db, { status: 'INTAKE', phaseDeadlines: DEADLINES });
    clock.set('2001-01-02T00:00:00.000Z');
    const holder = await testDb.pool.connect();
    try {
      await holder.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEYS.CAMPAIGN_PHASE]);
      expect(await scheduler.runOnce()).toEqual({ acquired: false, transitions: [] });
      expect((await readState(t.db, 'campaign', campaign.id)).status).toBe('INTAKE');
    } finally {
      await holder.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEYS.CAMPAIGN_PHASE]);
      holder.release();
    }
    await scheduler.runOnce();
    expect((await readState(t.db, 'campaign', campaign.id)).status).toBe('PREFERENCE_SELECTION');
  });

  it('GĐ0: a campaign changed since the scan is skipped without audit (row_version)', async () => {
    const campaign = await createCampaign(t.db, { status: 'INTAKE', rowVersion: 4, phaseDeadlines: DEADLINES });
    clock.set('2001-01-02T00:00:00.000Z');
    const repository = t.app.get(CampaignRepository);
    const scan = repository.listInAutoPhases.bind(repository);
    // The scan read row_version 3; someone has written the row since.
    const spy = jest.spyOn(repository, 'listInAutoPhases').mockImplementation(async () =>
      (await scan()).map((row) => (row.id === campaign.id ? { ...row, rowVersion: 3 } : row)),
    );
    try {
      const report = await scheduler.runOnce();
      expect(report.transitions.filter((x) => x.campaignId === campaign.id)).toEqual([]);
      expect(await transitionsOf(campaign.id)).toHaveLength(0);
      expect(await readState(t.db, 'campaign', campaign.id)).toMatchObject({ status: 'INTAKE', rowVersion: 4 });
    } finally {
      spy.mockRestore();
    }
  });
});
