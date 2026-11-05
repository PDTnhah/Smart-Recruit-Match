// US-3.3 AC-3, AC-5–AC-13 (FR-16, BR-04, GĐ4, PRD Q6, CONTEXT D47): a student replaces their whole
// preference list from their shortlist, under a lock of their own, with an audit entry per save; the
// list locks at `preference_end`; Q6 gives preferences to students who chose none.
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiErrorSchema, type CampaignStatus, NotificationContentSchema, PreferenceListSchema } from '@srm/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import { auditLogs, matchRuns, preferences } from '../../src/db/schema/index.js';
import { AuditService } from '../../src/modules/audit/index.js';
import { CAMPAIGN_PHASE_CHANGED, type CampaignPhaseChangedEvent } from '../../src/modules/campaign/index.js';
import { AutoAssignPreferencesService } from '../../src/modules/matching/application/auto-assign-preferences.service.js';
import { PreferenceAutoAssignScheduler } from '../../src/modules/matching/application/preference-auto-assign.scheduler.js';
import { RULES_VERSION } from '../../src/modules/matching/domain/rules-version.js';
import { EmailRenderer } from '../../src/modules/notification/application/email-renderer.js';
import {
  PREFERENCES_AUTO_ASSIGNED,
  PREFERENCES_REPLACED,
  type PreferencesAutoAssignedEvent,
  type PreferencesReplacedEvent,
} from '../../src/modules/matching/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { createPreference } from '../helpers/factories.js';
import { captureEvents, inDays } from '../helpers/jd.js';
import { notificationsOfType, waitFor } from '../helpers/notifications.js';
import {
  createApprovedJds,
  createConfirmedCv,
  createPreferenceCampaign,
  type CvRef,
  scorePair,
  waitingPair,
} from '../helpers/shortlist.js';
import {
  auditEntries,
  createStateTestingModule,
  insertInState,
  lifecycle,
  readState,
  runConcurrently,
} from '../helpers/state.js';

type Jd = { id: number; version: number };

describe('GĐ4 preference lists (US-3.3)', () => {
  let t: AuthTestApp;
  let replaced: PreferencesReplacedEvent[];
  let autoAssigned: PreferencesAutoAssignedEvent[];

  beforeAll(async () => {
    t = await createAuthTestApp();
    replaced = captureEvents(t.app, PREFERENCES_REPLACED);
    autoAssigned = captureEvents(t.app, PREFERENCES_AUTO_ASSIGNED);
  });

  afterAll(async () => {
    await t.close();
  });

  /**
   * A campaign with four approved JDs and a student whose shortlist is, best first, `jds[2]` (80),
   * `jds[0]` (70), `jds[1]` (60), `jds[3]` (55); plus a fifth JD scored below θ_cv.
   */
  async function seed(options: { status?: CampaignStatus; preferenceEnd?: string; config?: Record<string, unknown> } = {}) {
    const campaign = await createPreferenceCampaign(t.db, options);
    const jds = await createApprovedJds(t.db, campaign.id, 5);
    const student = await studentIn(campaign.id, jds, [70, 60, 80, 55, 40]);
    return { campaign, jds, ...student };
  }

  async function studentIn(campaignId: number, jds: Jd[], scores: (number | null)[]) {
    const student = await t.loginAs('STUDENT');
    const studentId = student.user.studentId!;
    const row = await createConfirmedCv(t.db, studentId, campaignId);
    const cv: CvRef = { id: row.id, version: row.version, studentId, campaignId };
    for (const [index, sCv] of scores.entries()) if (sCv !== null) await scorePair(t.db, cv, jds[index]!, sCv);
    return { student, studentId, cv };
  }

  const put = (student: LoggedIn, campaignId: number, jdIds: number[]) =>
    student.agent
      .put(api('me/preferences'))
      .send({ campaignId, preferences: jdIds.map((jdId, index) => ({ jdId, rank: index + 1 })) });

  const rowsOf = (studentId: number) =>
    t.db
      .select({ jdId: preferences.jdId, rank: preferences.rank, status: preferences.status })
      .from(preferences)
      .where(eq(preferences.studentId, studentId))
      .orderBy(asc(preferences.rank));

  const listAudits = (studentId: number) =>
    t.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entity, 'preference_list'), eq(auditLogs.entityId, studentId)))
      .orderBy(asc(auditLogs.id));

  const items = (...jdIds: number[]) => jdIds.map((jdId, index) => ({ jdId, rank: index + 1 }));

  it('GĐ4 BR-04 replace preferences in one transaction with audit', async () => {
    const { campaign, jds, student, studentId } = await seed();
    const [a, b, c] = jds.map((jd) => jd.id);

    const first = PreferenceListSchema.parse((await put(student, campaign.id, [c!, a!]).expect(200)).body);
    expect(first).toEqual({
      campaignId: campaign.id,
      preferences: [
        { jdId: c, rank: 1, status: 'PENDING_TEST' },
        { jdId: a, rank: 2, status: 'PENDING_TEST' },
      ],
    });
    expect(await rowsOf(studentId)).toEqual(first.preferences);

    // NV1 and NV2 swap, NV3 is added: the whole list is replaced.
    const second = PreferenceListSchema.parse((await put(student, campaign.id, [a!, c!, b!]).expect(200)).body);
    expect(second.preferences.map((p) => p.jdId)).toEqual([a, c, b]);
    expect(await rowsOf(studentId)).toEqual(second.preferences);

    const audits = await listAudits(studentId);
    expect(audits.map((row) => [row.action, row.actorKind, row.actorId, row.before, row.after])).toEqual([
      ['PREFERENCES_REPLACED', 'USER', student.user.id, { campaignId: campaign.id, items: [] }, { campaignId: campaign.id, items: items(c!, a!) }],
      [
        'PREFERENCES_REPLACED',
        'USER',
        student.user.id,
        { campaignId: campaign.id, items: items(c!, a!) },
        { campaignId: campaign.id, items: items(a!, c!, b!) },
      ],
    ]);
    // US-3.4 recounts the JDs added or dropped: a and c only moved in the second save.
    expect(replaced.filter((event) => event.studentId === studentId)).toEqual([
      { campaignId: campaign.id, studentId, jdIds: [a, c].sort((x, y) => x! - y!) },
      { campaignId: campaign.id, studentId, jdIds: [b] },
    ]);

    // The shortlist shows the saved ranks; an empty list clears it.
    const shortlist = (await student.agent.get(api('me/shortlist')).expect(200)).body as {
      items: { jd: { id: number }; preferenceRank: number | null }[];
    };
    expect(shortlist.items.map((item) => [item.jd.id, item.preferenceRank])).toEqual([
      [c, 2],
      [a, 1],
      [b, 3],
      [jds[3]!.id, null],
    ]);
    await put(student, campaign.id, []).expect(200);
    expect(await rowsOf(studentId)).toEqual([]);
  });

  it('BR-04 rejects over N_NV, outside shortlist, duplicates, gaps in rank', async () => {
    const { campaign, jds, student, studentId } = await seed();
    const [a, b, c, d, below] = jds.map((jd) => jd.id);
    await put(student, campaign.id, [a!]).expect(200);

    const rejected = async (body: object, code: string, message: string) => {
      const res = await student.agent.put(api('me/preferences')).send(body).expect(422);
      expect(ApiErrorSchema.parse(res.body)).toMatchObject({ code, message });
    };
    const list = (pairs: [number, number][]) => ({
      campaignId: campaign.id,
      preferences: pairs.map(([jdId, rank]) => ({ jdId, rank })),
    });
    await rejected(list([[a!, 1], [b!, 2], [c!, 3], [d!, 4]]), 'PREFERENCES_TOO_MANY', 'Chỉ được chọn tối đa 3 nguyện vọng');
    await rejected(list([[a!, 1], [below!, 2]]), 'PREFERENCE_NOT_IN_SHORTLIST', 'Chỉ chọn được JD trong danh sách gợi ý của mình');
    await rejected(list([[a!, 1], [a!, 2]]), 'PREFERENCE_DUPLICATE_JD', 'Mỗi JD chỉ chọn được một lần');
    await rejected(list([[a!, 1], [b!, 3]]), 'PREFERENCE_RANK_NOT_CONTIGUOUS', 'Thứ tự nguyện vọng phải liên tục từ NV1');
    // The shape is checked first: more than 20 entries, or a rank 0.
    const many = Array.from({ length: 21 }, (_, index) => ({ jdId: a!, rank: index + 1 }));
    await student.agent.put(api('me/preferences')).send({ campaignId: campaign.id, preferences: many }).expect(400);
    await student.agent
      .put(api('me/preferences'))
      .send({ campaignId: campaign.id, preferences: [{ jdId: a, rank: 0 }] })
      .expect(400);

    expect(await rowsOf(studentId)).toEqual([{ jdId: a, rank: 1, status: 'PENDING_TEST' }]);
    expect(await listAudits(studentId)).toHaveLength(1);
  });

  it('BR-04 IDOR: foreign jd_id 422', async () => {
    const { campaign, jds, student: a, studentId: aId } = await seed();
    // B's shortlist has a JD that A was never scored against.
    const [onlyB] = await createApprovedJds(t.db, campaign.id, 1);
    const b = await studentIn(campaign.id, [...jds, onlyB!], [null, null, null, null, null, 90]);
    await put(b.student, campaign.id, [onlyB!.id]).expect(200);

    const res = await put(a, campaign.id, [onlyB!.id]).expect(422);
    expect(res.body).toMatchObject({ code: 'PREFERENCE_NOT_IN_SHORTLIST', details: { jdIds: [onlyB!.id] } });
    expect(await rowsOf(aId)).toEqual([]);
    expect(await rowsOf(b.studentId)).toEqual([{ jdId: onlyB!.id, rank: 1, status: 'PENDING_TEST' }]);

    // Fields the API does not take are dropped: the list is the caller's, in PENDING_TEST (AGENTS › Invariant 7).
    await a.agent
      .put(api('me/preferences'))
      .send({
        campaignId: campaign.id,
        studentId: b.studentId,
        preferences: [{ jdId: jds[2]!.id, rank: 1, status: 'PASSED', studentId: b.studentId }],
      })
      .expect(200);
    expect(await rowsOf(aId)).toEqual([{ jdId: jds[2]!.id, rank: 1, status: 'PENDING_TEST' }]);
    expect(await rowsOf(b.studentId)).toEqual([{ jdId: onlyB!.id, rank: 1, status: 'PENDING_TEST' }]);
  });

  it('BR-04 DB constraints reject direct inserts', async () => {
    const { campaign, jds, studentId } = await seed();
    const [a, b] = jds.map((jd) => jd.id);
    await createPreference(t.db, { campaignId: campaign.id, studentId, jdId: a!, rank: 1 });

    const insert = (jdId: number, rank: number) =>
      t.db.insert(preferences).values({ campaignId: campaign.id, studentId, jdId, rank });
    await expect(insert(b!, 1)).rejects.toMatchObject({
      cause: { code: '23505', constraint: 'preferences_campaign_student_rank_key' },
    });
    await expect(insert(a!, 2)).rejects.toMatchObject({ cause: { code: '23505', constraint: 'preferences_student_jd_key' } });
    await expect(insert(b!, 0)).rejects.toMatchObject({ cause: { code: '23514', constraint: 'preferences_rank_check' } });
    await expect(
      t.db.insert(preferences).values({ campaignId: campaign.id, studentId, jdId: b!, rank: 2, status: 'ENROLLED' as never }),
    ).rejects.toMatchObject({ cause: { code: '23514', constraint: 'preferences_status_check' } });
    expect(await rowsOf(studentId)).toHaveLength(1);
  });

  it('GĐ4 require_full_preferences enforced when enabled', async () => {
    const required = await seed({ config: { require_full_preferences: true } });
    const [a, b, c] = required.jds.map((jd) => jd.id);
    const res = await put(required.student, required.campaign.id, [a!, b!]).expect(422);
    expect(res.body).toMatchObject({ code: 'PREFERENCES_INCOMPLETE', message: 'Đợt này yêu cầu chọn đủ 3 nguyện vọng' });
    await put(required.student, required.campaign.id, []).expect(422);
    await put(required.student, required.campaign.id, [a!, b!, c!]).expect(200);

    // A shortlist of one: one preference is a full list.
    const [only] = await createApprovedJds(t.db, required.campaign.id, 1);
    const short = await studentIn(required.campaign.id, [only!], [75]);
    await put(short.student, required.campaign.id, [only!.id]).expect(200);

    // Off by default: fewer than N_NV is accepted (the screen recommends a full list).
    const optional = await seed();
    await put(optional.student, optional.campaign.id, [optional.jds[0]!.id]).expect(200);
  });

  it('GĐ4 preferences locked after deadline (server time)', async () => {
    // The deadline passed, and the scheduler has not moved the campaign yet.
    const late = await seed({ preferenceEnd: inDays(-0.01) });
    const res = await put(late.student, late.campaign.id, [late.jds[0]!.id]).expect(409);
    expect(res.body).toMatchObject({
      code: 'CAMPAIGN_PHASE_MISMATCH',
      details: { campaignId: late.campaign.id, phaseEndedAt: late.campaign.phaseDeadlines.preference_end },
    });
    expect((await late.student.agent.get(api('me/shortlist')).expect(200)).body).toMatchObject({
      campaign: { editable: false },
    });

    // The campaign has moved on.
    const testing = await seed({ status: 'TESTING' });
    await put(testing.student, testing.campaign.id, [testing.jds[0]!.id]).expect(409);
    for (const { studentId } of [late, testing]) {
      expect(await rowsOf(studentId)).toEqual([]);
      expect(await listAudits(studentId)).toEqual([]);
    }

    // A campaign that does not exist.
    await put(late.student, 2_000_000_000, []).expect(404);
  });

  it('GĐ4 Q6 auto-assign top S_cv when policy enabled, idempotent; none when NONE', async () => {
    const { campaign, jds, student, studentId } = await seed({ status: 'TESTING' });
    const [a, b, c] = jds.map((jd) => jd.id);
    // Chose already: left as is.
    const chose = await studentIn(campaign.id, jds, [70, 60, 80, null, null]);
    await createPreference(t.db, { campaignId: campaign.id, studentId: chose.studentId, jdId: b!, rank: 1 });
    // Nothing reaches θ_cv: nothing to assign.
    const empty = await studentIn(campaign.id, jds, [10, 20, null, null, null]);
    // A shortlist of one: one preference.
    const one = await studentIn(campaign.id, jds, [null, null, null, 51, null]);

    t.app.get(EventEmitter2).emit(CAMPAIGN_PHASE_CHANGED, {
      campaignId: campaign.id,
      from: 'PREFERENCE_SELECTION',
      to: 'TESTING',
      actorKind: 'SYSTEM',
    } satisfies CampaignPhaseChangedEvent);
    const event = await waitFor(() => Promise.resolve(autoAssigned.find((e) => e.campaignId === campaign.id)));

    expect(await rowsOf(studentId)).toEqual([
      { jdId: c, rank: 1, status: 'PENDING_TEST' },
      { jdId: a, rank: 2, status: 'PENDING_TEST' },
      { jdId: b, rank: 3, status: 'PENDING_TEST' },
    ]);
    expect(await rowsOf(one.studentId)).toEqual([{ jdId: jds[3]!.id, rank: 1, status: 'PENDING_TEST' }]);
    expect(await rowsOf(chose.studentId)).toEqual([{ jdId: b, rank: 1, status: 'PENDING_TEST' }]);
    expect(await rowsOf(empty.studentId)).toEqual([]);
    expect(event).toEqual({
      campaignId: campaign.id,
      studentIds: [studentId, one.studentId].sort((x, y) => x - y),
      jdIds: [a, b, c, jds[3]!.id].sort((x, y) => x! - y!),
    });

    const [audit] = await listAudits(studentId);
    expect(audit).toMatchObject({
      action: 'PREFERENCES_AUTO_ASSIGNED',
      actorKind: 'SYSTEM',
      actorId: null,
      before: { campaignId: campaign.id, items: [] },
      after: { campaignId: campaign.id, items: items(c!, a!, b!) },
      reason: expect.stringContaining('Q6') as string,
    });
    const notices = await notificationsOfType(t.db, 'PREFERENCES_AUTO_ASSIGNED', student.user.id);
    expect(notices).toEqual([
      expect.objectContaining({
        channels: ['IN_APP', 'EMAIL'],
        payload: { campaignId: campaign.id, campaignName: campaign.name, count: 3 },
      }),
    ]);

    const email = t.app
      .get(EmailRenderer)
      .render(NotificationContentSchema.parse(notices[0]), { id: student.user.id, email: student.user.email, fullName: 'Trần Thị B', isActive: true });
    expect(email.subject).toBe(`Hệ thống đã chọn nguyện vọng cho bạn trong đợt "${campaign.name}"`);
    expect(email.text).toContain('đã chọn cho bạn 3 JD phù hợp nhất');
    expect(email.text).toContain('http://srm.test/sv/preferences');

    // Run again: nobody gets a second list, nobody a second notice.
    const service = t.app.get(AutoAssignPreferencesService);
    expect(await service.run(campaign.id)).toEqual({ assigned: [], outstanding: 0 });
    expect(await rowsOf(studentId)).toHaveLength(3);
    expect(await notificationsOfType(t.db, 'PREFERENCES_AUTO_ASSIGNED', student.user.id)).toHaveLength(1);
    expect(await listAudits(studentId)).toHaveLength(1);

    // Policy NONE: no preference is given.
    const none = await seed({ status: 'TESTING', config: { no_preference_policy: 'NONE' } });
    expect(await service.run(none.campaign.id)).toEqual({ assigned: [], outstanding: 0 });
    expect(await rowsOf(none.studentId)).toEqual([]);
  });

  it('GĐ4 Q6 sweep: a student with JDs still being scored waits for the run, then is served', async () => {
    const campaign = await createPreferenceCampaign(t.db, { status: 'TESTING' });
    const jds = await createApprovedJds(t.db, campaign.id, 2);
    const [first, second] = jds.map((jd) => jd.id);
    // Scored on both JDs: served even while a run is going.
    const whole = await studentIn(campaign.id, jds, [70, 60]);
    // One JD scored, the other still with the LLM.
    const partial = await studentIn(campaign.id, jds, [55, null]);
    await waitingPair(t.db, partial.cv, jds[1]!);
    const [run] = await t.db
      .insert(matchRuns)
      .values({
        campaignId: campaign.id,
        status: 'RUNNING',
        actorKind: 'SYSTEM',
        rulesVersion: RULES_VERSION,
        pairsTotal: 4,
        pairsIneligible: 0,
        pairsSkipped: 0,
        pairsCached: 4,
        pairsSent: 0,
      })
      .returning({ id: matchRuns.id });
    // A campaign still in preference selection is not swept.
    const open = await seed();

    const scheduler = t.app.get(PreferenceAutoAssignScheduler);
    const sweep = await scheduler.runOnce();
    expect(sweep.acquired).toBe(true);
    expect(sweep.assigned.get(campaign.id)).toEqual([whole.studentId]);
    expect(sweep.assigned.has(open.campaign.id)).toBe(false);
    expect(await rowsOf(whole.studentId)).toEqual([
      { jdId: first, rank: 1, status: 'PENDING_TEST' },
      { jdId: second, rank: 2, status: 'PENDING_TEST' },
    ]);
    expect(await rowsOf(partial.studentId)).toEqual([]);
    expect(await rowsOf(open.studentId)).toEqual([]);

    // The last result arrives and closes the run: the next sweep serves the whole shortlist.
    await scorePair(t.db, partial.cv, jds[1]!, 90);
    await t.db.update(matchRuns).set({ status: 'SUCCEEDED', finishedAt: sql`now()` }).where(eq(matchRuns.id, run!.id));
    expect((await scheduler.runOnce()).assigned.get(campaign.id)).toEqual([partial.studentId]);
    expect(await rowsOf(partial.studentId)).toEqual([
      { jdId: second, rank: 1, status: 'PENDING_TEST' },
      { jdId: first, rank: 2, status: 'PENDING_TEST' },
    ]);
    // Everyone served: a sweep again changes nothing.
    expect((await scheduler.runOnce()).assigned.has(campaign.id)).toBe(false);
    expect(await notificationsOfType(t.db, 'PREFERENCES_AUTO_ASSIGNED', partial.student.user.id)).toHaveLength(1);
  });

  it('transitionTo on preference: stale row_version 409, audit failure rolls back', async () => {
    const ctx = await createStateTestingModule();
    const failing = await createStateTestingModule((builder) =>
      builder.overrideProvider(AuditService).useValue({
        record: async (tx: { execute: (query: unknown) => Promise<unknown> }) => {
          await tx.execute(
            sql`INSERT INTO core.audit_logs (actor_kind, action, entity, entity_id) VALUES ('ROBOT', 'TRANSITION', 'application', 0)`,
          );
        },
      }),
    );
    try {
      const application = await insertInState(t.db, 'application', 'PENDING_TEST', 2);
      const request = {
        lifecycle: lifecycle('application'),
        id: application.id,
        to: 'TEST_GRADED' as const,
        actor: { kind: 'USER' as const, userId: 1 },
        reason: 'test graded',
      };
      await expect(ctx.service.transitionTo({ ...request, expectedRowVersion: 1 })).rejects.toMatchObject({
        code: 'ROW_VERSION_CONFLICT',
        httpStatus: 409,
      });
      await expect(failing.service.transitionTo({ ...request, expectedRowVersion: 2 })).rejects.toMatchObject({
        cause: { code: '23514' },
      });
      expect(await readState(t.db, 'application', application.id)).toEqual(application);
      expect(await auditEntries(t.db, 'application', application.id)).toEqual([]);

      // The table and the machine agree: a valid move succeeds and is audited.
      const moved = await ctx.service.transitionTo({ ...request, expectedRowVersion: 2 });
      expect(moved).toMatchObject({ from: 'PENDING_TEST', to: 'TEST_GRADED', rowVersion: 3 });
      expect(await auditEntries(t.db, 'application', application.id)).toHaveLength(1);
    } finally {
      await Promise.all([ctx.close(), failing.close()]);
    }
  });

  it('concurrent preference replacements are serialized', async () => {
    const { campaign, jds, student, studentId } = await seed();
    const [a, b, c] = jds.map((jd) => jd.id);
    const lists = [
      [a!, b!, c!],
      [c!, b!],
    ];
    const results = await runConcurrently(...lists.map((jdIds) => () => put(student, campaign.id, jdIds)));
    expect(results.map((result) => result.status === 'fulfilled' && result.value.status)).toEqual([200, 200]);

    const final = (await rowsOf(studentId)).map((row) => row.jdId);
    expect(lists).toContainEqual(final);
    // Each save has its own audit entry; the second one starts from the first one's list.
    const audits = await listAudits(studentId);
    expect(audits).toHaveLength(2);
    expect(audits[1]!.before).toEqual(audits[0]!.after);
    expect((audits[1]!.after as { items: { jdId: number }[] }).items.map((item) => item.jdId)).toEqual(final);
  });
});
