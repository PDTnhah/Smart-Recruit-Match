// US-5.2 (GĐ7, FR-26, FR-27, NFR-4, NFR-8, BR-07…BR-10, BR-17, AGENTS › Invariants 7, 9–11): an
// allocation round is run on the campaign's data, kept as a draft hidden from HR and students,
// adjusted with a reason and published. Rounds are seeded straight in the tables
// (test/helpers/allocation.ts); the clock is real.
import {
  ApiErrorSchema,
  AllocationExplanationSchema,
  type AllocationRoundView,
  AllocationRoundViewSchema,
  MyAllocationResultsSchema,
} from '@srm/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { allocationRounds, nominations, notifications, preferences } from '../../src/db/schema/index.js';
import { AllocationResultsService } from '../../src/modules/assessment/index.js';
import { ALLOCATION_ENGINE, type AllocationEngine, AllocationRoundService } from '../../src/modules/allocation/index.js';
import { PreferenceAllocationService } from '../../src/modules/matching/index.js';
import { REDIS } from '../../src/redis/redis.module.js';
import { AN, BINH, CHI, DUNG, PRD_QUOTAS, PRD_STUDENTS, type SeedStudent, seedAllocationCampaign } from '../helpers/allocation.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { GRADER_MODEL, GRADER_PROMPT } from '../helpers/grading.js';
import { auditEntries } from '../helpers/state.js';

const HOUR = 60 * 60_000;

/** The package version every round's config_snapshot names (BR-17). */
const SYSTEM_VERSION = (JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')) as { version: string })
  .version;

/** A fifth student: NV1 = A below θ_test (39.99 < 40), NV2 = C with the hard filter failed. */
const EM: SeedStudent = {
  prefs: [
    { jd: 0, sFinal: 60, sTest: 39.99 },
    { jd: 2, sFinal: 90, sTest: 90, eligible: false },
  ],
};
const EM_INDEX = 4;

type Response = { body: unknown };
const roundOf = (response: Response): AllocationRoundView => AllocationRoundViewSchema.parse(response.body);
const errorOf = (response: Response) => ApiErrorSchema.parse(response.body);
const detailsOf = <T>(response: Response) => errorOf(response).details as T;

describe('GĐ7 allocation rounds (US-5.2)', () => {
  let t: AuthTestApp;
  let center: LoggedIn;
  let redis: Redis;

  beforeAll(async () => {
    t = await createAuthTestApp();
    center = await t.loginAs('CENTER');
    redis = t.app.get<Redis>(REDIS);
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(() => t.close());

  const run = (campaignId: number) => center.agent.post(api(`campaigns/${campaignId}/allocation-rounds`));
  const patch = (roundId: number, rowVersion: number, operations: unknown[]) =>
    center.agent.patch(api(`allocation-rounds/${roundId}/nominations`)).send({ rowVersion, operations });
  const publish = (roundId: number, rowVersion: number) =>
    center.agent.post(api(`allocation-rounds/${roundId}/publish`)).send({ rowVersion });
  const nominationsOf = (campaignId: number) => t.db.select().from(nominations).where(eq(nominations.campaignId, campaignId));
  const roundsOf = (campaignId: number) => t.db.select().from(allocationRounds).where(eq(allocationRounds.campaignId, campaignId));
  const statusOf = async (preferenceId: number) =>
    (await t.db.select({ status: preferences.status }).from(preferences).where(eq(preferences.id, preferenceId)))[0]!.status;
  const holdersOf = (view: AllocationRoundView, jdId: number) =>
    view.jds.find((jd) => jd.jdId === jdId)!.nominations.map((nomination) => nomination.studentId);

  it('GĐ7 run creates DRAFT round hidden from HR and students; BR-17 replayRound reproduces engine output', async () => {
    const seed = await seedAllocationCampaign(t.db, { quotas: PRD_QUOTAS, students: [...PRD_STUDENTS, EM], graderRun: true });
    const view = roundOf(await run(seed.campaignId).expect(201));
    expect(view).toMatchObject({ roundNo: 1, status: 'DRAFT', publishedAt: null });
    const [a, b, c] = seed.jdIds as [number, number, number];
    // PRD › Ví dụ minh họa: A = Bình; B = Chi, An; C = Dũng.
    expect(holdersOf(view, a)).toEqual([seed.studentIds[BINH]]);
    expect(holdersOf(view, b)).toEqual([seed.studentIds[CHI], seed.studentIds[AN]]);
    expect(holdersOf(view, c)).toEqual([seed.studentIds[DUNG]]);
    expect(view.counts).toEqual({ students: 4, nominated: 4, unassigned: 0, excludedPairs: 2 });
    expect(view.warnings).toEqual([]);

    const [round] = await roundsOf(seed.campaignId);
    const snapshot = round!.inputSnapshot as { pairs: Record<string, unknown>[]; excluded: Record<string, unknown>[] };
    // AC-2: Em's pairs are kept out with their reasons. AC-3: provenance, no personal data.
    expect(snapshot.excluded.map((pair) => pair.reasons)).toEqual([['BELOW_THETA_TEST'], ['HARD_FILTER']]);
    expect(snapshot.pairs).toContainEqual(
      expect.objectContaining({
        matching: { model: 'fixture', promptVersion: 'matching/v1' },
        grading: [{ model: GRADER_MODEL, promptVersion: GRADER_PROMPT }],
      }),
    );
    expect(JSON.stringify(round!.inputSnapshot)).not.toContain('Nguyễn Văn A');
    expect(round!.configSnapshot).toMatchObject({ systemVersion: SYSTEM_VERSION, config: { k: 1, theta_test: 40 } });
    expect(await t.app.get(AllocationRoundService).replayRound(round!.id)).toMatchObject({ matches: true });

    // Not published: HR and students see nothing.
    const hr = await t.loginAs('HR', { companyId: seed.companyId });
    await hr.agent.get(api(`allocation-rounds/${round!.id}`)).expect(403);
    const student = await t.loginAs('STUDENT', { studentId: seed.studentIds[AN] });
    expect(MyAllocationResultsSchema.parse((await student.agent.get(api('me/allocation-results')).expect(200)).body)).toEqual({
      items: [],
    });
  });

  it('GĐ7 preconditions: wrong phase, pending grading, appeal window → 409', async () => {
    const testing = await seedAllocationCampaign(t.db, { quotas: [1], students: [], status: 'TESTING' });
    expect(errorOf(await run(testing.campaignId).expect(409)).code).toBe('CAMPAIGN_PHASE_MISMATCH');

    const pending = await seedAllocationCampaign(t.db, {
      quotas: [1, 1],
      students: [
        { prefs: [{ jd: 0, sFinal: 70, sTest: 60, publishedAt: new Date(Date.now() - HOUR) }] },
        { prefs: [{ jd: 1, sFinal: 0, sTest: null, status: 'PENDING_TEST' }] },
      ],
    });
    const refused = await run(pending.campaignId).expect(409);
    expect(errorOf(refused).code).toBe('ALLOCATION_NOT_READY');
    expect(detailsOf<{ pending: unknown[] }>(refused).pending).toEqual([
      expect.objectContaining({ kind: 'APPEAL_WINDOW_OPEN', preferenceId: pending.preferenceIds[0]![0] }),
      expect.objectContaining({ kind: 'TEST_NOT_FINAL', preferenceId: pending.preferenceIds[1]![0] }),
    ]);
    expect(await roundsOf(pending.campaignId)).toEqual([]);
    // The lock was released with the failure.
    expect(await redis.get(`lock:allocation:${pending.campaignId}`)).toBeNull();
  });

  it('GĐ7 rerun replaces draft and is audited', async () => {
    const seed = await seedAllocationCampaign(t.db, { quotas: PRD_QUOTAS, students: PRD_STUDENTS });
    const first = roundOf(await run(seed.campaignId).expect(201));
    const removed = (await nominationsOf(seed.campaignId)).find((n) => n.studentId === seed.studentIds[DUNG])!;
    await patch(first.id, first.rowVersion, [{ op: 'remove', nominationId: removed.id, reason: 'Thử điều chỉnh' }]).expect(200);

    const again = roundOf(await run(seed.campaignId).expect(201));
    expect(again.id).toBe(first.id);
    expect(again.rowVersion).toBe(first.rowVersion + 2);
    expect(again.adjustments).toEqual([]);
    expect((await nominationsOf(seed.campaignId)).map((n) => n.studentId).sort()).toEqual([...seed.studentIds].sort());
    const actions = (await auditEntries(t.db, 'allocation_round', first.id)).map((entry) => entry.action);
    expect(actions).toEqual(['ALLOCATION_ROUND_RERUN', 'ALLOCATION_ROUND_RUN']);
  });

  it('GĐ7 unstable result is rolled back', async () => {
    const seed = await seedAllocationCampaign(t.db, { quotas: PRD_QUOTAS, students: PRD_STUDENTS });
    // AC-4: a faulty engine through DI: nobody is nominated, so every NV1 is a blocking pair.
    const engine = t.app.get<AllocationEngine>(ALLOCATION_ENGINE);
    jest.spyOn(engine, 'allocate').mockImplementationOnce((input) => ({
      held: new Map([...input.capacity.keys()].map((jd) => [jd, []])),
      unassigned: [...input.preferences.keys()],
    }));
    const response = await run(seed.campaignId).expect(500);
    expect(errorOf(response).code).toBe('ALLOCATION_UNSTABLE');
    expect(detailsOf<{ violations: unknown[] }>(response).violations).toContainEqual(
      expect.objectContaining({ type: 'BLOCKING_PAIR' }),
    );
    expect(await roundsOf(seed.campaignId)).toEqual([]);
    expect(await nominationsOf(seed.campaignId)).toEqual([]);
    expect(await redis.get(`lock:allocation:${seed.campaignId}`)).toBeNull();
  });

  it('GĐ7 concurrent runs: one 409, lock released after', async () => {
    const seed = await seedAllocationCampaign(t.db, { quotas: PRD_QUOTAS, students: PRD_STUDENTS });
    // Holds the first run inside its transaction long enough for the second to arrive.
    const results = t.app.get(AllocationResultsService);
    const original = results.listForAllocation.bind(results);
    jest.spyOn(results, 'listForAllocation').mockImplementation(async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return original(...args);
    });
    const answers = await Promise.all([run(seed.campaignId), run(seed.campaignId)]);
    expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409]);
    expect(errorOf(answers.find((answer) => answer.status === 409)!).code).toBe('ALLOCATION_IN_PROGRESS');
    expect(await redis.get(`lock:allocation:${seed.campaignId}`)).toBeNull();
  });

  it('BR-08 partial unique index rejects second active nomination at DB level', async () => {
    const seed = await seedAllocationCampaign(t.db, { quotas: PRD_QUOTAS, students: PRD_STUDENTS });
    const round = roundOf(await run(seed.campaignId).expect(201));
    const held = (await nominationsOf(seed.campaignId)).find((n) => n.studentId === seed.studentIds[AN])!;
    const [other] = await t.db
      .insert(allocationRounds)
      .values({ campaignId: seed.campaignId, roundNo: 2, inputSnapshot: {}, configSnapshot: {}, engineResult: {}, ranAt: new Date() })
      .returning();
    const copy = { ...held, roundId: other!.id, rowVersion: 0 } as Partial<typeof held>;
    delete copy.id; // generated always
    await expect(t.db.insert(nominations).values(copy as typeof nominations.$inferInsert)).rejects.toMatchObject({
      cause: { code: '23505', constraint: 'nominations_active_student_key' },
    });

    // Through the API: An already holds B in this round; A is one of An's eligible pairs.
    const refused = await patch(round.id, round.rowVersion, [
      { op: 'add', studentId: seed.studentIds[AN], jdId: seed.jdIds[0], reason: 'Thêm' },
    ]).expect(409);
    expect(errorOf(refused).code).toBe('NOMINATION_STUDENT_ACTIVE');
  });

  it('BR-10 adjustment requires reason and writes audit in same transaction; BR-07/BR-09 violations → 422; AD-8 stale row_version → 409', async () => {
    const seed = await seedAllocationCampaign(t.db, { quotas: PRD_QUOTAS, students: [...PRD_STUDENTS, EM] });
    const round = roundOf(await run(seed.campaignId).expect(201));
    const [a, b, c] = seed.jdIds as [number, number, number];
    const of = async (student: number) => (await nominationsOf(seed.campaignId)).find((n) => n.studentId === seed.studentIds[student])!;
    const dung = await of(DUNG);
    const chi = await of(CHI);

    await patch(round.id, round.rowVersion, [{ op: 'remove', nominationId: dung.id, reason: '  ' }]).expect(400);
    const em = seed.studentIds[EM_INDEX]!;
    const belowTheta = await patch(round.id, round.rowVersion, [{ op: 'add', studentId: em, jdId: a, reason: 'Thêm Em' }]).expect(422);
    expect(errorOf(belowTheta)).toMatchObject({ code: 'NOMINATION_NOT_ELIGIBLE', details: { reasons: ['BELOW_THETA_TEST'] } });
    const full = await patch(round.id, round.rowVersion, [
      { op: 'move', nominationId: (await of(AN)).id, jdId: a, reason: 'Đổi' },
    ]).expect(422);
    expect(errorOf(full).code).toBe('NOMINATION_OVER_CAPACITY');

    // Dũng off C, then Chi from B to C: all or none, in order.
    const adjusted = roundOf(
      await patch(round.id, round.rowVersion, [
        { op: 'remove', nominationId: dung.id, reason: 'Doanh nghiệp báo Dũng đã có nơi khác' },
        { op: 'move', nominationId: chi.id, jdId: c, reason: 'Chi muốn vị trí C' },
      ]).expect(200),
    );
    expect(adjusted.rowVersion).toBe(round.rowVersion + 1);
    expect(adjusted.adjustments).toEqual([
      expect.objectContaining({ op: 'remove', studentId: dung.studentId, fromJdId: c, toJdId: null, actorId: center.user.id }),
      expect.objectContaining({ op: 'move', studentId: chi.studentId, fromJdId: b, toJdId: c }),
    ]);
    // B now lacks a profile; Dũng would have had B and C: unstable pairs, shown, not blocking.
    expect(adjusted.jds.find((jd) => jd.jdId === b)).toMatchObject({ nominated: 1, short: true });
    expect(adjusted.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ studentId: dung.studentId, jdId: c, outranksStudentId: chi.studentId })]),
    );
    expect(adjusted.unassigned).toContainEqual(
      expect.objectContaining({
        studentId: dung.studentId,
        preferences: [
          expect.objectContaining({ jdId: b, reason: 'MANUAL_ADJUSTMENT' }),
          expect.objectContaining({ jdId: c, reason: 'MANUAL_ADJUSTMENT' }),
        ],
      }),
    );
    const moved = (await nominationsOf(seed.campaignId)).find((n) => n.id === chi.id)!;
    expect(moved).toMatchObject({ jdId: c, overrideReason: 'Chi muốn vị trí C', rank: 1 });
    expect((await auditEntries(t.db, 'nomination', chi.id))[0]).toMatchObject({
      action: 'NOMINATION_MOVED',
      actorId: center.user.id,
      reason: 'Chi muốn vị trí C',
      before: expect.objectContaining({ jdId: b }) as unknown,
      after: expect.objectContaining({ jdId: c }) as unknown,
    });
    expect((await auditEntries(t.db, 'nomination', dung.id))[0]).toMatchObject({ action: 'NOMINATION_REMOVED' });

    // A second staff member still holding the first version.
    const stale = await patch(round.id, round.rowVersion, [{ op: 'remove', nominationId: chi.id, reason: 'Bỏ' }]).expect(409);
    expect(errorOf(stale).code).toBe('ROW_VERSION_CONFLICT');
    expect(errorOf(await publish(round.id, round.rowVersion).expect(409)).code).toBe('ROW_VERSION_CONFLICT');
  });

  it('GĐ7 publish transitions round and preferences, notifies after commit; NFR-4 explanation; RBAC and IDOR', async () => {
    const seed = await seedAllocationCampaign(t.db, { quotas: PRD_QUOTAS, students: PRD_STUDENTS });
    const hr = await t.loginAs('HR', { companyId: seed.companyId });
    const students = await Promise.all(seed.studentIds.map((studentId) => t.loginAs('STUDENT', { studentId })));
    const an = students[AN]!;
    const round = roundOf(await run(seed.campaignId).expect(201));

    // AC-12: only CENTER.
    await hr.agent.post(api(`allocation-rounds/${round.id}/publish`)).send({ rowVersion: round.rowVersion }).expect(403);
    await an.agent.post(api(`campaigns/${seed.campaignId}/allocation-rounds`)).expect(403);
    await hr.agent.get(api(`allocation-rounds/${round.id}/students/${seed.studentIds[AN]}/explanation`)).expect(403);

    const published = roundOf(await publish(round.id, round.rowVersion).expect(200));
    expect(published).toMatchObject({ status: 'PUBLISHED', publishedAt: expect.any(String) as unknown });
    // Bình holds A (NV1); his C waits for the next round. An holds B (NV2); his A waits.
    expect(await statusOf(seed.preferenceIds[BINH]![0]!)).toBe('NOMINATED');
    expect(await statusOf(seed.preferenceIds[BINH]![1]!)).toBe('WAITING_NEXT_ROUND');
    expect(await statusOf(seed.preferenceIds[AN]![0]!)).toBe('WAITING_NEXT_ROUND');
    expect(await statusOf(seed.preferenceIds[AN]![1]!)).toBe('NOMINATED');

    const notices = await t.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.type, 'NOMINATIONS_PUBLISHED'), inArray(notifications.userId, [hr.user.id, an.user.id])));
    expect(notices.every((notice) => notice.channels.join() === 'IN_APP')).toBe(true);
    expect(notices.filter((notice) => notice.userId === an.user.id).map((notice) => notice.payload)).toEqual([
      expect.objectContaining({ audience: 'STUDENT', roundNo: 1, jd: expect.objectContaining({ jdId: seed.jdIds[1] }) as unknown }),
    ]);
    const perJd = notices
      .filter((notice) => notice.userId === hr.user.id)
      .map((notice) => notice.payload as { jd: { jdId: number }; nominationCount: number })
      .map((payload) => [payload.jd.jdId, payload.nominationCount] as const)
      .sort((x, y) => x[0] - y[0]);
    expect(perJd).toEqual([
      [seed.jdIds[0], 1],
      [seed.jdIds[1], 2],
      [seed.jdIds[2], 1],
    ]);

    // Published is final.
    expect(errorOf(await publish(round.id, published.rowVersion).expect(409)).code).toBe('ALLOCATION_ROUND_PUBLISHED');
    await patch(round.id, published.rowVersion, [{ op: 'remove', nominationId: 1, reason: 'Bỏ' }]).expect(409);
    expect(errorOf(await run(seed.campaignId).expect(409)).code).toBe('ALLOCATION_ROUND_PUBLISHED');

    // NFR-4: An asks about A. The center sees Bình's score; An sees only the reason and his own.
    const explanation = AllocationExplanationSchema.parse(
      (await center.agent.get(api(`allocation-rounds/${round.id}/students/${seed.studentIds[AN]}/explanation`)).expect(200)).body,
    );
    expect(explanation.items).toEqual([
      expect.objectContaining({
        jdId: seed.jdIds[0],
        reason: 'FULL_WITH_HIGHER_RANKED',
        sFinal: 88,
        lowestHeld: { studentCode: seed.studentCodes[BINH], sFinal: 92 },
      }),
    ]);
    const mine = await an.agent.get(api('me/allocation-results')).expect(200);
    expect(MyAllocationResultsSchema.parse(mine.body).items).toEqual([
      expect.objectContaining({
        campaignId: seed.campaignId,
        nomination: expect.objectContaining({ jdId: seed.jdIds[1], status: 'NOMINATED' }) as unknown,
        preferences: [expect.objectContaining({ jdId: seed.jdIds[0], reason: 'FULL_WITH_HIGHER_RANKED', sFinal: 88 })],
      }),
    ]);
    // IDOR: no way to name another student; nothing of Bình in An's answer.
    expect(JSON.stringify(mine.body)).not.toContain(seed.studentCodes[BINH]!);
    expect(JSON.stringify(mine.body)).not.toContain('lowestHeld');
    const asked = await an.agent.get(api(`me/allocation-results?studentId=${seed.studentIds[BINH]}`)).expect(200);
    expect(asked.body).toEqual(mine.body);
    await an.agent.get(api(`allocation-rounds/${round.id}/students/${seed.studentIds[BINH]}/explanation`)).expect(403);
  });

  it('GĐ7 publish failure rolls back without notifications', async () => {
    const seed = await seedAllocationCampaign(t.db, { quotas: PRD_QUOTAS, students: PRD_STUDENTS });
    const student = await t.loginAs('STUDENT', { studentId: seed.studentIds[AN] });
    const round = roundOf(await run(seed.campaignId).expect(201));
    jest.spyOn(t.app.get(PreferenceAllocationService), 'markWaitingNextRound').mockRejectedValueOnce(new Error('boom'));
    await publish(round.id, round.rowVersion).expect(500);
    const [row] = await roundsOf(seed.campaignId);
    expect(row).toMatchObject({ status: 'DRAFT', publishedAt: null, rowVersion: round.rowVersion });
    expect(await statusOf(seed.preferenceIds[AN]![1]!)).toBe('TEST_GRADED');
    const notices = await t.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.type, 'NOMINATIONS_PUBLISHED'), eq(notifications.userId, student.user.id)));
    expect(notices).toEqual([]);
  });

  it('NFR-8 full round for 500 students × 50 JDs under 60s', async () => {
    const students: SeedStudent[] = Array.from({ length: 500 }, (_, s) => ({
      prefs: [0, 1, 2].map((p) => {
        const sFinal = 40 + ((s * 37 + p * 11) % 6000) / 100;
        return { jd: (s * 7 + p * 13) % 50, sFinal, sTest: sFinal };
      }),
    }));
    const seed = await seedAllocationCampaign(t.db, { quotas: Array.from({ length: 50 }, (_, j) => 3 + (j % 5)), students, k: 1.5 });
    const started = Date.now();
    const view = roundOf(await run(seed.campaignId).expect(201));
    const elapsed = Date.now() - started;
    console.info(`NFR-8 allocation round, 500 students × 50 JDs × 3 NV: ${elapsed} ms`);
    expect(elapsed).toBeLessThan(60_000);
    const stored = await nominationsOf(seed.campaignId);
    expect(new Set(stored.map((n) => n.studentId)).size).toBe(stored.length); // BR-08
    for (const jd of view.jds) expect(jd.nominated).toBeLessThanOrEqual(jd.capacity); // BR-09
    expect(view.warnings).toEqual([]);
  }, 600_000);
});
