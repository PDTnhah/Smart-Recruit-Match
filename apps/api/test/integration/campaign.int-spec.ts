// US-1.4 AC-1…AC-5 (FR-2, GĐ0): create, read, edit and open campaigns over HTTP; US-1.10 (FR-41):
// edits after opening, cancelling and deleting.
// Deadlines here stay near the real time, so the scheduler tests (FakeClock in 2001) never touch
// these campaigns (see test/helpers/fake-clock.ts).
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ApiErrorSchema,
  type Campaign,
  CAMPAIGN_CANCEL_REASON_REQUIRED,
  CampaignListSchema,
  CAMPAIGN_EDIT_REASON_REQUIRED,
  CampaignSchema,
  DEADLINE_TOO_SOON,
  DEFAULT_CAMPAIGN_CONFIG,
} from '@srm/shared';
import { eq } from 'drizzle-orm';
import { campaigns, consents } from '../../src/db/schema/index.js';
import {
  CAMPAIGN_CANCELLED,
  CAMPAIGN_OPENED,
  CAMPAIGN_PHASE_CHANGED,
  CAMPAIGN_UPDATED,
  type CampaignCancelledEvent,
  type CampaignOpenedEvent,
  type CampaignPhaseChangedEvent,
  type CampaignUpdatedEvent,
} from '../../src/modules/campaign/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import {
  createCampaign,
  createCv,
  createJobDescription,
  createStudent,
  TEST_CAMPAIGN_TARGET,
} from '../helpers/factories.js';
import { auditEntries, readState } from '../helpers/state.js';

const DAY = 86_400_000;
const target = { cohorts: ['K66'], majors: ['CNTT'] };

/** ISO instant `days` from the real now. */
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const inHours = (hours: number) => new Date(Date.now() + (hours * DAY) / 24).toISOString();

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
  const updated: CampaignUpdatedEvent[] = [];
  const cancelled: CampaignCancelledEvent[] = [];

  beforeAll(async () => {
    t = await createAuthTestApp();
    center = await t.loginAs('CENTER');
    const events = t.app.get(EventEmitter2);
    events.on(CAMPAIGN_OPENED, (event: CampaignOpenedEvent) => opened.push(event));
    events.on(CAMPAIGN_PHASE_CHANGED, (event: CampaignPhaseChangedEvent) => phaseChanges.push(event));
    events.on(CAMPAIGN_UPDATED, (event: CampaignUpdatedEvent) => updated.push(event));
    events.on(CAMPAIGN_CANCELLED, (event: CampaignCancelledEvent) => cancelled.push(event));
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

    it('FR-41: fields the phase has already used return 409 CAMPAIGN_CONFIG_LOCKED', async () => {
      const campaign = await openCampaign(await createDraft());
      for (const [body, field] of [
        [{ config: { match_top_m: 5 } }, 'config.match_top_m'],
        [{ config: { t_test_minutes: 60 } }, 'config.t_test_minutes'],
        // A cohort taken out: students already in the campaign stay in it.
        [{ target: { cohorts: ['K70'], majors: ['CNTT'] } }, 'target.cohorts'],
      ] as const) {
        const res = await center.agent
          .patch(api(`campaigns/${campaign.id}`))
          .send({ rowVersion: campaign.rowVersion, reason: 'Sửa', ...body })
          .expect(409);
        expect(ApiErrorSchema.parse(res.body)).toMatchObject({ code: 'CAMPAIGN_CONFIG_LOCKED', details: { fields: [field] } });
      }
      const res = await center.agent
        .patch(api(`campaigns/${campaign.id}`))
        .send({
          rowVersion: campaign.rowVersion,
          config: { match_top_m: 5, n_nv: 3, competition_thresholds: { ...DEFAULT_CAMPAIGN_CONFIG.competition_thresholds } },
        })
        .expect(409);
      // Unchanged values are not edits, an object compared by value (US-3.4 AC-9): only match_top_m is reported.
      expect(ApiErrorSchema.parse(res.body).details).toMatchObject({ status: 'INTAKE', fields: ['config.match_top_m'] });
      expect((await readState(t.db, 'campaign', campaign.id)).rowVersion).toBe(campaign.rowVersion);
    });

    it('FR-41: during intake the center renames, adds a cohort and changes S_cv weights, with reason and audit', async () => {
      const campaign = await openCampaign(await createDraft());
      const weights = { scv_weight_project: 0.3, scv_weight_language: 0 };
      const body = {
        rowVersion: campaign.rowVersion,
        name: 'Đợt HK1 (bổ sung K67)',
        target: { cohorts: ['K66', 'K67'], majors: ['CNTT'] },
        config: { ...weights, theta_cv: 55 },
      };

      const noReason = await center.agent.patch(api(`campaigns/${campaign.id}`)).send(body).expect(400);
      expect(ApiErrorSchema.parse(noReason.body).details).toEqual({
        issues: [{ path: 'reason', message: CAMPAIGN_EDIT_REASON_REQUIRED }],
      });
      // The merged weights must still add up to 1.
      const unbalanced = await center.agent
        .patch(api(`campaigns/${campaign.id}`))
        .send({ ...body, config: { scv_weight_project: 0.3 }, reason: 'x' })
        .expect(400);
      expect(issuePaths(unbalanced.body)).toEqual(['config.scv_weight_language']);

      const res = await center.agent
        .patch(api(`campaigns/${campaign.id}`))
        .send({ ...body, reason: 'Thêm khóa K67 theo đề nghị của khoa' })
        .expect(200);
      const edited = CampaignSchema.parse(res.body);
      expect(edited).toMatchObject({
        name: body.name,
        target: body.target,
        config: { ...weights, theta_cv: 55 },
        rowVersion: campaign.rowVersion + 1,
      });

      const [entry] = await auditEntries(t.db, 'campaign', campaign.id);
      expect(entry).toMatchObject({
        action: 'CAMPAIGN_UPDATED_AFTER_OPEN',
        actorId: center.user.id,
        reason: 'Thêm khóa K67 theo đề nghị của khoa',
      });
      expect(entry?.before).toMatchObject({ name: campaign.name, target });
      expect(entry?.after).toMatchObject({ name: body.name, target: body.target });
      expect(updated.find((event) => event.campaignId === campaign.id)).toEqual({
        campaignId: campaign.id,
        rowVersion: edited.rowVersion,
        targetBefore: target,
        // In the order of the config schema.
        configKeys: ['theta_cv', 'scv_weight_project', 'scv_weight_language'],
        deadlines: [],
        reason: 'Thêm khóa K67 theo đề nghị của khoa',
      });
    });

    it('FR-41: a deadline still ahead moves later, or earlier but not within 24 hours', async () => {
      const campaign = await openCampaign(await createDraft());
      const tooSoon = await center.agent
        .patch(api(`campaigns/${campaign.id}`))
        .send({ rowVersion: campaign.rowVersion, phaseDeadlines: { intake_end: inHours(12) }, reason: 'x' })
        .expect(400);
      expect(ApiErrorSchema.parse(tooSoon.body).details).toEqual({
        issues: [{ path: 'phaseDeadlines.intake_end', message: DEADLINE_TOO_SOON }],
      });
      const cleared = await center.agent
        .patch(api(`campaigns/${campaign.id}`))
        .send({ rowVersion: campaign.rowVersion, phaseDeadlines: { testing_end: null }, reason: 'x' })
        .expect(400);
      expect(issuePaths(cleared.body)).toEqual(['phaseDeadlines.testing_end']);

      const moves = { intake_end: inDays(3), testing_end: inDays(25) };
      const res = await center.agent
        .patch(api(`campaigns/${campaign.id}`))
        .send({ rowVersion: campaign.rowVersion, phaseDeadlines: moves, reason: 'Rút ngắn nhận CV, thêm thời gian làm test' })
        .expect(200);
      const edited = CampaignSchema.parse(res.body);
      expect(edited.phaseDeadlines).toEqual({ ...campaign.phaseDeadlines, ...moves });

      const [entry] = await auditEntries(t.db, 'campaign', campaign.id);
      expect(entry).toMatchObject({ action: 'CAMPAIGN_UPDATED_AFTER_OPEN', reason: 'Rút ngắn nhận CV, thêm thời gian làm test' });
      expect(entry?.before).toMatchObject({ phaseDeadlines: campaign.phaseDeadlines });
      expect(updated.find((event) => event.campaignId === campaign.id)).toMatchObject({
        targetBefore: null,
        configKeys: [],
        deadlines: [
          { key: 'intake_end', before: campaign.phaseDeadlines.intake_end, after: moves.intake_end },
          { key: 'testing_end', before: campaign.phaseDeadlines.testing_end, after: moves.testing_end },
        ],
      });
    });

    it('FR-41: after intake, θ_cv and the target are locked while θ_test and k still change', async () => {
      const running = await createCampaign(t.db, {
        status: 'PREFERENCE_SELECTION',
        rowVersion: 3,
        phaseDeadlines: { intake_end: inDays(-1), preference_end: inDays(6), testing_end: inDays(13) },
      });
      const locked = await center.agent
        .patch(api(`campaigns/${running.id}`))
        .send({
          rowVersion: 3,
          config: { theta_cv: 60, theta_test: 50 },
          target: { cohorts: [...TEST_CAMPAIGN_TARGET.cohorts, 'K99'], majors: TEST_CAMPAIGN_TARGET.majors },
          reason: 'x',
        })
        .expect(409);
      expect(ApiErrorSchema.parse(locked.body).details).toMatchObject({ fields: ['target.cohorts', 'config.theta_cv'] });

      const res = await center.agent
        .patch(api(`campaigns/${running.id}`))
        .send({ rowVersion: 3, config: { theta_test: 50, k: 2 }, reason: 'Nâng ngưỡng test' })
        .expect(200);
      expect(CampaignSchema.parse(res.body).config).toMatchObject({ theta_test: 50, k: 2 });
    });

    it('FR-41: once intake_end passes, before the scheduler moves the campaign, the 409 names the actual phase', async () => {
      const running = await createCampaign(t.db, {
        status: 'INTAKE',
        rowVersion: 1,
        phaseDeadlines: { intake_end: inDays(-1), preference_end: inDays(6), testing_end: inDays(13) },
      });
      const res = await center.agent
        .patch(api(`campaigns/${running.id}`))
        .send({ rowVersion: 1, config: { theta_cv: 70 }, reason: 'Nâng ngưỡng' })
        .expect(409);
      expect(ApiErrorSchema.parse(res.body)).toMatchObject({
        code: 'CAMPAIGN_CONFIG_LOCKED',
        details: { status: 'PREFERENCE_SELECTION', fields: ['config.theta_cv'] },
      });
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

    it('FR-41: nothing about a closed campaign changes', async () => {
      const closed = await createCampaign(t.db, {
        status: 'CLOSED',
        phaseDeadlines: { intake_end: inDays(-30), preference_end: inDays(-20), testing_end: inDays(-10) },
      });
      const res = await center.agent
        .patch(api(`campaigns/${closed.id}`))
        .send({ rowVersion: closed.rowVersion, name: 'Tên mới', config: { reminder_hours_before: 12 }, reason: 'x' })
        .expect(409);
      expect(ApiErrorSchema.parse(res.body).details).toMatchObject({ fields: ['name', 'config.reminder_hours_before'] });
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

  describe('US-1.10 AC-6: cancel', () => {
    const cancel = (campaign: { id: number }, body: Record<string, unknown>) =>
      center.agent.post(api(`campaigns/${campaign.id}/cancel`)).send(body);

    it('FR-41: cancel moves an open campaign to CANCELLED with the reason, then publishes both events', async () => {
      const campaign = await openCampaign(await createDraft());

      const noReason = await cancel(campaign, { rowVersion: campaign.rowVersion, reason: '  ' }).expect(400);
      expect(ApiErrorSchema.parse(noReason.body).details?.issues).toEqual([
        expect.objectContaining({ path: 'reason', message: CAMPAIGN_CANCEL_REASON_REQUIRED }),
      ]);
      await cancel(campaign, { rowVersion: 0, reason: 'Không tổ chức' }).expect(409);

      const res = await cancel(campaign, { rowVersion: campaign.rowVersion, reason: ' Không đủ doanh nghiệp ' }).expect(
        200,
      );
      expect(CampaignSchema.parse(res.body)).toMatchObject({ status: 'CANCELLED', rowVersion: 2 });
      const entry = (await auditEntries(t.db, 'campaign', campaign.id))[0];
      expect(entry).toMatchObject({
        action: 'TRANSITION',
        actorId: center.user.id,
        reason: 'Không đủ doanh nghiệp',
        before: { status: 'INTAKE' },
        after: { status: 'CANCELLED' },
      });
      expect(phaseChanges.filter((event) => event.campaignId === campaign.id).at(-1)).toEqual({
        campaignId: campaign.id,
        from: 'INTAKE',
        to: 'CANCELLED',
        actorKind: 'USER',
      });
      expect(cancelled.filter((event) => event.campaignId === campaign.id)).toEqual([
        { campaignId: campaign.id, reason: 'Không đủ doanh nghiệp' },
      ]);

      // CANCELLED is final, and nothing about it changes any more.
      const again = await cancel(campaign, { rowVersion: 2, reason: 'Lần nữa' }).expect(422);
      expect(ApiErrorSchema.parse(again.body).code).toBe('INVALID_TRANSITION');
      const edit = await center.agent
        .patch(api(`campaigns/${campaign.id}`))
        .send({ rowVersion: 2, name: 'Tên mới', reason: 'x' })
        .expect(409);
      expect(ApiErrorSchema.parse(edit.body)).toMatchObject({ code: 'CAMPAIGN_CONFIG_LOCKED', details: { fields: ['name'] } });
      // An edit that would change nothing is refused too, not answered 200.
      const empty = await center.agent
        .patch(api(`campaigns/${campaign.id}`))
        .send({ rowVersion: 2, name: campaign.name, reason: 'x' })
        .expect(409);
      expect(ApiErrorSchema.parse(empty.body)).toMatchObject({
        code: 'CAMPAIGN_CONFIG_LOCKED',
        details: { status: 'CANCELLED', fields: [] },
      });
    });

    it('FR-41: a draft or a closed campaign cannot be cancelled; other roles get 403', async () => {
      const draft = await createDraft();
      const closed = await createCampaign(t.db, { status: 'CLOSED', rowVersion: 6 });
      for (const campaign of [draft, closed]) {
        const res = await cancel(campaign, { rowVersion: campaign.rowVersion, reason: 'x' }).expect(422);
        expect(ApiErrorSchema.parse(res.body).details).toMatchObject({ to: 'CANCELLED' });
      }
      const running = await openCampaign(await createDraft());
      for (const role of ['HR', 'STUDENT', 'ADMIN'] as const) {
        const { agent } = await t.loginAs(role);
        await agent.post(api(`campaigns/${running.id}/cancel`)).send({ rowVersion: 1, reason: 'x' }).expect(403);
        await agent.delete(api(`campaigns/${draft.id}?rowVersion=0`)).expect(403);
      }
      expect(await readState(t.db, 'campaign', running.id)).toMatchObject({ status: 'INTAKE', rowVersion: 1 });
      expect(await readState(t.db, 'campaign', draft.id)).toMatchObject({ status: 'DRAFT', rowVersion: 0 });
    });
  });

  describe('US-1.10 AC-9: delete', () => {
    const remove = (id: number, query: string) => center.agent.delete(api(`campaigns/${id}${query}`));

    it('FR-41: a draft or an open campaign nothing refers to is deleted, with an audit entry', async () => {
      const draft = await createDraft();
      const open = await openCampaign(await createDraft());

      await remove(draft.id, '').expect(400);
      const stale = await remove(open.id, '?rowVersion=0').expect(409);
      expect(ApiErrorSchema.parse(stale.body).code).toBe('ROW_VERSION_CONFLICT');

      for (const campaign of [draft, open]) {
        await remove(campaign.id, `?rowVersion=${campaign.rowVersion}`).expect(204);
        await center.agent.get(api(`campaigns/${campaign.id}`)).expect(404);
        const entry = (await auditEntries(t.db, 'campaign', campaign.id))[0];
        expect(entry).toMatchObject({
          action: 'CAMPAIGN_DELETED',
          actorId: center.user.id,
          before: { name: campaign.name, status: campaign.status, rowVersion: campaign.rowVersion },
          after: null,
        });
      }
      await remove(draft.id, '?rowVersion=0').expect(404);
    });

    it('FR-41: a campaign with a consent, a CV or a JD returns 409 CAMPAIGN_HAS_DATA and stays', async () => {
      const withConsent = await createCampaign(t.db, { status: 'INTAKE', rowVersion: 1 });
      const student = await createStudent(t.db);
      await t.db.insert(consents).values({
        studentId: student.id,
        campaignId: withConsent.id,
        termsVersion: 1,
        termsSha256: 'a'.repeat(64),
        acceptedAt: new Date(),
      });
      const withCv = await createCampaign(t.db, { status: 'INTAKE', rowVersion: 1 });
      await createCv(t.db, { campaignId: withCv.id });
      // A draft with a JD cannot happen through the API; the foreign key decides all the same.
      const withJd = await createCampaign(t.db);
      await createJobDescription(t.db, { campaignId: withJd.id });

      for (const campaign of [withConsent, withCv, withJd]) {
        const res = await remove(campaign.id, `?rowVersion=${campaign.rowVersion}`).expect(409);
        expect(ApiErrorSchema.parse(res.body)).toMatchObject({
          code: 'CAMPAIGN_HAS_DATA',
          details: { campaignId: campaign.id },
        });
        expect(await readState(t.db, 'campaign', campaign.id)).toMatchObject({
          status: campaign.status,
          rowVersion: campaign.rowVersion,
        });
        // The audit entry rolled back with the refused DELETE.
        expect((await auditEntries(t.db, 'campaign', campaign.id)).map((e) => e.action)).not.toContain(
          'CAMPAIGN_DELETED',
        );
      }
    });
  });
});
