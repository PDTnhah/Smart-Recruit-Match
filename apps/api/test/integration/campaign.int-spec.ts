// US-1.4 AC-1…AC-5 (FR-2, GĐ0): create, read, edit and open campaigns over HTTP.
// Deadlines here stay near the real time, so the scheduler tests (FakeClock in 2001) never touch
// these campaigns (see test/helpers/fake-clock.ts).
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ApiErrorSchema,
  type Campaign,
  CampaignListSchema,
  CampaignSchema,
  DEADLINE_NOT_LATER,
  DEADLINE_REASON_REQUIRED,
  DEFAULT_CAMPAIGN_CONFIG,
} from '@srm/shared';
import { eq } from 'drizzle-orm';
import { campaigns } from '../../src/db/schema/index.js';
import {
  CAMPAIGN_OPENED,
  CAMPAIGN_PHASE_CHANGED,
  type CampaignOpenedEvent,
  type CampaignPhaseChangedEvent,
} from '../../src/modules/campaign/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { createCampaign, createStudent } from '../helpers/factories.js';
import { auditEntries, readState } from '../helpers/state.js';

const DAY = 86_400_000;
const target = { cohorts: ['K66'], majors: ['CNTT'] };

/** ISO instant `days` from the real now. */
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const futureDeadlines = () => ({ intake_end: inDays(7), preference_end: inDays(14), testing_end: inDays(21) });

function issuePaths(body: unknown): string[] {
  const { details } = ApiErrorSchema.parse(body);
  return (details?.issues as { path: string }[]).map((issue) => issue.path);
}

describe('FR-2: campaign setup API (US-1.4)', () => {
  let t: AuthTestApp;
  let center: LoggedIn;
  const opened: CampaignOpenedEvent[] = [];
  const phaseChanges: CampaignPhaseChangedEvent[] = [];

  beforeAll(async () => {
    t = await createAuthTestApp();
    center = await t.loginAs('CENTER');
    const events = t.app.get(EventEmitter2);
    events.on(CAMPAIGN_OPENED, (event: CampaignOpenedEvent) => opened.push(event));
    events.on(CAMPAIGN_PHASE_CHANGED, (event: CampaignPhaseChangedEvent) => phaseChanges.push(event));
  });

  afterAll(async () => {
    await t.close();
  });

  async function createDraft(body: Record<string, unknown> = {}): Promise<Campaign> {
    const res = await center.agent
      .post(api('campaigns'))
      .send({ name: 'Đợt thực tập HK1', target, phaseDeadlines: futureDeadlines(), ...body })
      .expect(201);
    return CampaignSchema.parse(res.body);
  }

  async function openCampaign(campaign: Campaign): Promise<Campaign> {
    const res = await center.agent
      .post(api(`campaigns/${campaign.id}/open`))
      .send({ rowVersion: campaign.rowVersion })
      .expect(200);
    return CampaignSchema.parse(res.body);
  }

  describe('AC-1: create', () => {
    it('GĐ0: center creates campaign in DRAFT with PRD default config and audit row', async () => {
      const deadlines = futureDeadlines();
      const res = await center.agent
        .post(api('campaigns'))
        .send({ name: '  Đợt HK1 2026–2027 ', target, phaseDeadlines: deadlines })
        .expect(201);
      const campaign = CampaignSchema.parse(res.body);

      expect(campaign).toMatchObject({
        name: 'Đợt HK1 2026–2027',
        status: 'DRAFT',
        target,
        phaseDeadlines: deadlines,
        rowVersion: 0,
      });
      expect(campaign.config).toEqual(DEFAULT_CAMPAIGN_CONFIG);

      // The target is stored inside campaigns.config (CONTEXT D27).
      const [row] = await t.db.select().from(campaigns).where(eq(campaigns.id, campaign.id));
      expect(row?.config).toEqual({ ...DEFAULT_CAMPAIGN_CONFIG, target });

      const audit = await auditEntries(t.db, 'campaign', campaign.id);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        action: 'CAMPAIGN_CREATED',
        actorKind: 'USER',
        actorId: center.user.id,
        before: null,
      });
      expect(audit[0]?.after).toMatchObject({ name: 'Đợt HK1 2026–2027', status: 'DRAFT', target });
    });

    it('GĐ0: given parameters override the defaults, the others keep them; deadlines may be missing', async () => {
      const campaign = await createDraft({ config: { n_nv: 5, alpha: 0.3, beta: 0.7 }, phaseDeadlines: {} });
      expect(campaign.config).toEqual({ ...DEFAULT_CAMPAIGN_CONFIG, n_nv: 5, alpha: 0.3, beta: 0.7 });
      expect(campaign.phaseDeadlines).toEqual({});
    });

    it('stores deadlines as UTC instants whatever offset they were sent with', async () => {
      const campaign = await createDraft({ phaseDeadlines: { intake_end: '2030-01-01T17:00:00+07:00' } });
      expect(campaign.phaseDeadlines).toEqual({ intake_end: '2030-01-01T10:00:00.000Z' });
    });
  });

  describe('AC-2: validation', () => {
    it('GĐ0: invalid parameters and deadlines answer 400 with one issue per field', async () => {
      const res = await center.agent
        .post(api('campaigns'))
        .send({
          name: 'Đợt lỗi',
          target,
          phaseDeadlines: { intake_end: inDays(14), preference_end: inDays(7) },
          config: { alpha: 0.5, beta: 0.6, theta_cv: 120, n_nv: 0, k: 0.5, t_test_minutes: 0, r_max: 0 },
        })
        .expect(400);
      expect(ApiErrorSchema.parse(res.body).code).toBe('VALIDATION_FAILED');
      expect(issuePaths(res.body).sort()).toEqual(
        [
          'config.beta',
          'config.k',
          'config.n_nv',
          'config.r_max',
          'config.t_test_minutes',
          'config.theta_cv',
          'phaseDeadlines.preference_end',
        ].sort(),
      );
    });

    it('GĐ0: a draft edit checks alpha + beta on the merged config', async () => {
      const campaign = await createDraft();
      const res = await center.agent
        .patch(api(`campaigns/${campaign.id}`))
        .send({ rowVersion: campaign.rowVersion, config: { alpha: 0.5 } })
        .expect(400);
      expect(issuePaths(res.body)).toEqual(['config.beta']);
    });

    it('GĐ0: a draft edit keeps the deadlines in phase order', async () => {
      const campaign = await createDraft();
      const res = await center.agent
        .patch(api(`campaigns/${campaign.id}`))
        .send({ rowVersion: campaign.rowVersion, phaseDeadlines: { intake_end: inDays(30) } })
        .expect(400);
      expect(issuePaths(res.body)).toEqual(['phaseDeadlines.preference_end']);
    });
  });

  describe('AC-3: roles and read scope', () => {
    it('FR-2: non-center roles get 403 on create and update', async () => {
      const campaign = await createDraft();
      for (const role of ['HR', 'STUDENT', 'ADMIN'] as const) {
        const { agent } = await t.loginAs(role);
        await agent.post(api('campaigns')).send({ name: 'x', target }).expect(403);
        await agent.patch(api(`campaigns/${campaign.id}`)).send({ rowVersion: 0, name: 'y' }).expect(403);
        await agent.post(api(`campaigns/${campaign.id}/open`)).send({ rowVersion: 0 }).expect(403);
      }
      expect((await readState(t.db, 'campaign', campaign.id)).rowVersion).toBe(0);
    });

    it('FR-2: campaign outside caller scope returns 404', async () => {
      const draft = await createDraft();
      const running = await createCampaign(t.db, {
        status: 'INTAKE',
        config: { target: { cohorts: ['K66', 'K67'], majors: ['CNTT'] } },
      });
      const otherMajor = await createCampaign(t.db, {
        status: 'INTAKE',
        config: { target: { cohorts: ['K66'], majors: ['Kinh tế'] } },
      });
      const [matching, wrongCohort] = await Promise.all([
        createStudent(t.db, { cohort: 'K67', major: 'cntt' }),
        createStudent(t.db, { cohort: 'K65', major: 'CNTT' }),
      ]);
      const [hr, student, outsider, admin] = await Promise.all([
        t.loginAs('HR'),
        t.loginAs('STUDENT', { studentId: matching.id }),
        t.loginAs('STUDENT', { studentId: wrongCohort.id }),
        t.loginAs('ADMIN'),
      ]);

      // Drafts: only CENTER and ADMIN.
      await hr.agent.get(api(`campaigns/${draft.id}`)).expect(404);
      await student.agent.get(api(`campaigns/${draft.id}`)).expect(404);
      await admin.agent.get(api(`campaigns/${draft.id}`)).expect(200);
      // Open campaigns: HR sees all; a student only those targeting both their cohort and major.
      await hr.agent.get(api(`campaigns/${otherMajor.id}`)).expect(200);
      await student.agent.get(api(`campaigns/${running.id}`)).expect(200);
      await student.agent.get(api(`campaigns/${otherMajor.id}`)).expect(404);
      const notFound = await outsider.agent.get(api(`campaigns/${running.id}`)).expect(404);
      expect(ApiErrorSchema.parse(notFound.body).code).toBe('ENTITY_NOT_FOUND');
      await center.agent.get(api('campaigns/999999999')).expect(404);

      const idsOf = async (agent: LoggedIn['agent']) =>
        CampaignListSchema.parse((await agent.get(api('campaigns')).expect(200)).body).items.map((c) => c.id);
      const [hrIds, studentIds, outsiderIds, adminIds, centerIds] = await Promise.all([
        idsOf(hr.agent),
        idsOf(student.agent),
        idsOf(outsider.agent),
        idsOf(admin.agent),
        idsOf(center.agent),
      ]);
      expect(hrIds).toEqual(expect.arrayContaining([running.id, otherMajor.id]));
      expect(hrIds).not.toContain(draft.id);
      expect(studentIds).toContain(running.id);
      expect(studentIds).not.toContain(draft.id);
      expect(studentIds).not.toContain(otherMajor.id);
      expect(outsiderIds).not.toContain(running.id);
      expect(adminIds).toEqual(expect.arrayContaining([draft.id, running.id]));
      expect(centerIds).toEqual(expect.arrayContaining([draft.id, running.id, otherMajor.id]));
      // Newest first.
      expect(centerIds.indexOf(otherMajor.id)).toBeLessThan(centerIds.indexOf(draft.id));
    });
  });

  it('a campaign whose stored config does not parse is left out of the list instead of failing it', async () => {
    const [damaged] = await t.db.insert(campaigns).values({ name: 'Đợt hỏng', config: {} }).returning();
    const res = await center.agent.get(api('campaigns')).expect(200);
    expect(CampaignListSchema.parse(res.body).items.map((c) => c.id)).not.toContain(damaged!.id);
  });

  describe('AC-4: edit', () => {
    it('FR-2: center edits every field of a draft and the audit keeps before and after', async () => {
      const campaign = await createDraft();
      const deadlines = futureDeadlines();
      const res = await center.agent
        .patch(api(`campaigns/${campaign.id}`))
        .send({
          rowVersion: 0,
          name: 'Đợt HK2',
          target: { cohorts: ['K67'], majors: ['CNTT', 'KHMT'] },
          phaseDeadlines: { ...deadlines, testing_end: inDays(28) },
          config: { n_nv: 4, k: 2 },
        })
        .expect(200);
      const updated = CampaignSchema.parse(res.body);
      expect(updated).toMatchObject({
        name: 'Đợt HK2',
        target: { cohorts: ['K67'], majors: ['CNTT', 'KHMT'] },
        rowVersion: 1,
        status: 'DRAFT',
      });
      expect(updated.config).toEqual({ ...DEFAULT_CAMPAIGN_CONFIG, n_nv: 4, k: 2 });

      const [entry] = await auditEntries(t.db, 'campaign', campaign.id);
      expect(entry).toMatchObject({ action: 'CAMPAIGN_UPDATED', actorId: center.user.id });
      expect(entry?.before).toMatchObject({ name: 'Đợt thực tập HK1', rowVersion: 0 });
      expect(entry?.after).toMatchObject({ name: 'Đợt HK2', rowVersion: 1, config: { n_nv: 4, k: 2 } });
    });

    it('FR-2: a draft deadline can be cleared with null', async () => {
      const campaign = await createDraft();
      const res = await center.agent
        .patch(api(`campaigns/${campaign.id}`))
        .send({ rowVersion: 0, phaseDeadlines: { testing_end: null } })
        .expect(200);
      expect(Object.keys(CampaignSchema.parse(res.body).phaseDeadlines)).toEqual(['intake_end', 'preference_end']);
    });

    it('FR-2: stale row_version returns 409', async () => {
      const campaign = await createDraft();
      await center.agent.patch(api(`campaigns/${campaign.id}`)).send({ rowVersion: 0, name: 'Lần 1' }).expect(200);
      const res = await center.agent
        .patch(api(`campaigns/${campaign.id}`))
        .send({ rowVersion: 0, name: 'Lần 2' })
        .expect(409);
      expect(ApiErrorSchema.parse(res.body).code).toBe('ROW_VERSION_CONFLICT');
      expect(CampaignSchema.parse((await center.agent.get(api(`campaigns/${campaign.id}`))).body).name).toBe('Lần 1');
    });

    it('FR-2: config edit after DRAFT returns 409 CAMPAIGN_CONFIG_LOCKED', async () => {
      const campaign = await openCampaign(await createDraft());
      for (const body of [{ config: { k: 2 } }, { name: 'Tên mới' }, { target: { cohorts: ['K70'], majors: ['CNTT'] } }]) {
        const res = await center.agent
          .patch(api(`campaigns/${campaign.id}`))
          .send({ rowVersion: campaign.rowVersion, ...body })
          .expect(409);
        expect(ApiErrorSchema.parse(res.body).code).toBe('CAMPAIGN_CONFIG_LOCKED');
      }
      const res = await center.agent
        .patch(api(`campaigns/${campaign.id}`))
        .send({ rowVersion: campaign.rowVersion, config: { k: 2, n_nv: 3 } })
        .expect(409);
      // Unchanged values are not edits: only k is reported.
      expect(ApiErrorSchema.parse(res.body).details).toMatchObject({ status: 'INTAKE', fields: ['config.k'] });
      expect((await readState(t.db, 'campaign', campaign.id)).rowVersion).toBe(campaign.rowVersion);
    });

    it('FR-2: extending a future deadline requires reason and writes audit', async () => {
      const campaign = await openCampaign(await createDraft());
      const later = { intake_end: inDays(9) };

      const noReason = await center.agent
        .patch(api(`campaigns/${campaign.id}`))
        .send({ rowVersion: campaign.rowVersion, phaseDeadlines: later })
        .expect(400);
      expect(ApiErrorSchema.parse(noReason.body).details).toEqual({
        issues: [{ path: 'reason', message: DEADLINE_REASON_REQUIRED }],
      });

      const earlier = await center.agent
        .patch(api(`campaigns/${campaign.id}`))
        .send({ rowVersion: campaign.rowVersion, phaseDeadlines: { preference_end: inDays(10) }, reason: 'x' })
        .expect(400);
      expect(ApiErrorSchema.parse(earlier.body).details).toEqual({
        issues: [{ path: 'phaseDeadlines.preference_end', message: DEADLINE_NOT_LATER }],
      });

      const res = await center.agent
        .patch(api(`campaigns/${campaign.id}`))
        .send({ rowVersion: campaign.rowVersion, phaseDeadlines: later, reason: 'Gia hạn nộp CV hai ngày' })
        .expect(200);
      const extended = CampaignSchema.parse(res.body);
      expect(extended.phaseDeadlines.intake_end).toBe(later.intake_end);
      expect(extended.rowVersion).toBe(campaign.rowVersion + 1);

      const [entry] = await auditEntries(t.db, 'campaign', campaign.id);
      expect(entry).toMatchObject({
        action: 'CAMPAIGN_DEADLINES_EXTENDED',
        actorId: center.user.id,
        reason: 'Gia hạn nộp CV hai ngày',
      });
      expect(entry?.before).toMatchObject({ phaseDeadlines: { intake_end: campaign.phaseDeadlines.intake_end } });
      expect(entry?.after).toMatchObject({ phaseDeadlines: { intake_end: later.intake_end } });
    });

    it('FR-2: a deadline that has passed cannot move', async () => {
      const running = await createCampaign(t.db, {
        status: 'PREFERENCE_SELECTION',
        rowVersion: 3,
        phaseDeadlines: { intake_end: inDays(-1), preference_end: inDays(6), testing_end: inDays(13) },
      });
      const res = await center.agent
        .patch(api(`campaigns/${running.id}`))
        .send({ rowVersion: 3, phaseDeadlines: { intake_end: inDays(1) }, reason: 'Mở lại' })
        .expect(409);
      expect(ApiErrorSchema.parse(res.body)).toMatchObject({
        code: 'CAMPAIGN_CONFIG_LOCKED',
        details: { fields: ['phaseDeadlines.intake_end'] },
      });
    });
  });

  describe('AC-5: open', () => {
    it('GĐ0: open moves DRAFT to INTAKE with audit and emits campaign.opened', async () => {
      const draft = await createDraft();
      const campaign = await openCampaign(draft);
      expect(campaign).toMatchObject({ status: 'INTAKE', rowVersion: 1 });

      const [entry] = await auditEntries(t.db, 'campaign', draft.id);
      expect(entry).toMatchObject({
        action: 'TRANSITION',
        actorKind: 'USER',
        actorId: center.user.id,
        before: { status: 'DRAFT', rowVersion: 0 },
        after: { status: 'INTAKE', rowVersion: 1 },
      });
      expect(opened.filter((event) => event.campaignId === draft.id)).toEqual([{ campaignId: draft.id }]);
      // AC-6: manual transitions announce the phase change too.
      expect(phaseChanges.filter((event) => event.campaignId === draft.id)).toEqual([
        { campaignId: draft.id, from: 'DRAFT', to: 'INTAKE', actorKind: 'USER' },
      ]);
    });

    it('GĐ0: open with missing or past deadline returns 422', async () => {
      const missing = await createDraft({ phaseDeadlines: { intake_end: inDays(7) } });
      const past = await createDraft({
        phaseDeadlines: { intake_end: inDays(-2), preference_end: inDays(7), testing_end: inDays(14) },
      });
      for (const [campaign, reasonCode] of [
        [missing, 'DEADLINES_MISSING'],
        [past, 'DEADLINE_IN_PAST'],
      ] as const) {
        const res = await center.agent
          .post(api(`campaigns/${campaign.id}/open`))
          .send({ rowVersion: campaign.rowVersion })
          .expect(422);
        expect(ApiErrorSchema.parse(res.body)).toMatchObject({
          code: 'TRANSITION_CONDITION_FAILED',
          details: { reasonCode },
        });
        expect(await readState(t.db, 'campaign', campaign.id)).toMatchObject({ status: 'DRAFT', rowVersion: 0 });
        expect((await auditEntries(t.db, 'campaign', campaign.id)).map((e) => e.action)).toEqual(['CAMPAIGN_CREATED']);
        expect(opened.some((event) => event.campaignId === campaign.id)).toBe(false);
      }
    });

    it('opening twice or with a stale row_version is refused', async () => {
      const campaign = await openCampaign(await createDraft());
      await center.agent.post(api(`campaigns/${campaign.id}/open`)).send({ rowVersion: 0 }).expect(409);
      const again = await center.agent
        .post(api(`campaigns/${campaign.id}/open`))
        .send({ rowVersion: campaign.rowVersion })
        .expect(422);
      expect(ApiErrorSchema.parse(again.body).code).toBe('INVALID_TRANSITION');
    });
  });
});
