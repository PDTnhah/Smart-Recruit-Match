// US-5.3 (GĐ8, FR-28, FR-29, BR-11…BR-13, AD-8, AGENTS › Invariants 7, 8, 10, 11): HR reads the
// nominations of its own JDs from published rounds, opens one with its evidence, invites or rejects
// with a reason, asks for more candidates; HR's deadline is reminded and the center may extend it.
// Rounds are seeded with test/helpers/allocation.ts, then run and published through the API. The
// clock is a FakeClock at real time; the SLA tests move it to March 2003 and backdate their round,
// so the sweep never reaches another file's rounds (published at real time, far later).
import {
  ApiErrorSchema,
  FileUrlSchema,
  HrDecisionResultSchema,
  JdNominationListSchema,
  MyAllocationResultsSchema,
  MyNominationReviewsSchema,
  NominationDetailSchema,
  ReviewDeadlineListSchema,
  ReviewDeadlineSchema,
  SupplementRequestSchema,
} from '@srm/shared';
import { eq } from 'drizzle-orm';
import { Clock } from '../../src/common/clock/index.js';
import { allocationRounds, cvs, examSessions, hrReviews, nominations, preferences } from '../../src/db/schema/index.js';
import { ReviewSlaScheduler } from '../../src/modules/review/index.js';
import { addWorkingDays } from '../../src/modules/review/domain/working-days.js';
import { AN, BINH, CHI, PRD_QUOTAS, PRD_STUDENTS, type SeedOptions, seedAllocationCampaign } from '../helpers/allocation.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { SAMPLE_CV_PROFILE } from '../helpers/factories.js';
import { FakeClock } from '../helpers/fake-clock.js';
import { notificationsOfType } from '../helpers/notifications.js';
import { auditEntries } from '../helpers/state.js';

type Response = { body: unknown };
const errorOf = (response: Response) => ApiErrorSchema.parse(response.body);

/** A local time in Vietnam (UTC+7). */
const vn = (local: string) => new Date(`${local}+07:00`);

describe('GĐ8 HR review of nominations (US-5.3)', () => {
  const clock = new FakeClock();
  let t: AuthTestApp;
  let center: LoggedIn;

  beforeAll(async () => {
    t = await createAuthTestApp({ configure: (b) => b.overrideProvider(Clock).useValue(clock) });
    center = await t.loginAs('CENTER');
  });

  afterEach(() => {
    clock.set(new Date());
    jest.restoreAllMocks();
  });

  afterAll(() => t.close());

  /** Runs round 1 of the seeded campaign through the API; publishes it unless `draft`. */
  async function round(options: SeedOptions, { draft = false } = {}) {
    const seed = await seedAllocationCampaign(t.db, options);
    const ran = await center.agent.post(api(`campaigns/${seed.campaignId}/allocation-rounds`)).send({ rowVersion: null }).expect(201);
    const { id: roundId, rowVersion } = ran.body as { id: number; rowVersion: number };
    if (!draft) await center.agent.post(api(`allocation-rounds/${roundId}/publish`)).send({ rowVersion }).expect(200);
    const hr = await t.loginAs('HR', { companyId: seed.companyId });
    const rows = await t.db.select().from(nominations).where(eq(nominations.roundId, roundId));
    const nominationOf = (student: number) => rows.find((row) => row.studentId === seed.studentIds[student])!;
    return { seed, roundId, hr, nominationOf };
  }

  const prdRound = (options: { draft?: boolean } = {}) => round({ quotas: PRD_QUOTAS, students: PRD_STUDENTS }, options);
  const list = (hr: LoggedIn, jdId: number) => hr.agent.get(api(`jds/${jdId}/nominations`));
  const decide = (hr: LoggedIn, nominationId: number, body: Record<string, unknown>) =>
    hr.agent.post(api(`nominations/${nominationId}/decision`)).send(body);
  const statusOf = async (preferenceId: number) =>
    (await t.db.select({ status: preferences.status }).from(preferences).where(eq(preferences.id, preferenceId)))[0]!.status;

  it('GĐ8 HR lists published nominations sorted by S_final with tie-break (AC-1, BR-13)', async () => {
    // One JD, three places: S_final 80 twice, S_test breaks the tie (US-5.1).
    const options: SeedOptions = {
      quotas: [3],
      students: [
        { prefs: [{ jd: 0, sFinal: 80, sTest: 70, sCv: 60 }] },
        { prefs: [{ jd: 0, sFinal: 80, sTest: 75, sCv: 61 }] },
        { prefs: [{ jd: 0, sFinal: 90, sTest: 60, sCv: 62 }] },
      ],
    };
    const draft = await round(options, { draft: true });
    // A draft is invisible to HR.
    expect(JdNominationListSchema.parse((await list(draft.hr, draft.seed.jdIds[0]!).expect(200)).body).items).toEqual([]);

    const { seed, hr, roundId } = await round(options);
    const body = JdNominationListSchema.parse((await list(hr, seed.jdIds[0]!).expect(200)).body);
    expect(body.items.map((item) => item.student.studentId)).toEqual([seed.studentIds[2], seed.studentIds[1], seed.studentIds[0]]);
    expect(body.items[1]).toMatchObject({ sFinal: 80, sTest: 75, sCv: 61, status: 'NOMINATED', roundNo: 1, review: null });
    expect(body.items[1]!.student.studentCode).toBe(seed.studentCodes[1]);
    const [published] = await t.db.select().from(allocationRounds).where(eq(allocationRounds.id, roundId));
    // AC-10: published_at + SLA_HR (5) working days.
    expect(body.items[0]!.reviewDueAt).toBe(addWorkingDays(published!.publishedAt!, 5).toISOString());
    expect(body).toMatchObject({ jd: { jdId: seed.jdIds[0], quota: 3 }, invitedCount: 0, supplement: { blockedBy: null } });
  });

  it('GĐ8 nomination detail includes evidence, skill map, flags; never answer keys (AC-2)', async () => {
    const { seed, hr, nominationOf } = await prdRound();
    const binh = nominationOf(BINH);
    await t.db
      .update(examSessions)
      .set({ skillScores: [{ skill: 'SQL', scoreX100: 8_050 }], flags: [{ code: 'INSTRUCTION_IN_ANSWER', questionId: 1 }] })
      .where(eq(examSessions.id, seed.sessionIds[BINH]![0]!));

    const response = await hr.agent.get(api(`nominations/${binh.id}`)).expect(200);
    const detail = NominationDetailSchema.parse(response.body);
    expect(detail).toMatchObject({
      nominationId: binh.id,
      status: 'NOMINATED',
      jd: { jdId: seed.jdIds[0] },
      student: { studentId: seed.studentIds[BINH] },
      scores: { sFinal: 92, sTest: 90, sCv: 70 },
      cv: { fileId: `nomination:${binh.id}`, profile: SAMPLE_CV_PROFILE },
      test: { skills: [{ skill: 'SQL', score: 80.5 }] },
      cvTrust: { state: 'NONE' },
      warnings: [{ code: 'INSTRUCTION_IN_ANSWER', count: 1 }],
      review: null,
    });
    expect(detail.match?.sCv).toBe(70);
    // Invariant 8: nothing of the answers, keys or rubrics.
    expect(JSON.stringify(response.body)).not.toMatch(/answerKey|answer_key|rubric|"pii"/i);
    // The CV file through the 5-minute URL of US-1.6.
    FileUrlSchema.parse((await hr.agent.get(api(`files/nomination:${binh.id}/url`)).expect(200)).body);
  });

  it('BR-11 HR of another company gets 404 on list, detail, decision, CV file (AC-3)', async () => {
    const { seed, hr, nominationOf } = await prdRound();
    const outsider = await t.loginAs('HR');
    const an = nominationOf(AN);
    for (const res of [
      await list(outsider, seed.jdIds[1]!),
      await outsider.agent.get(api(`nominations/${an.id}`)),
      await decide(outsider, an.id, { decision: 'INVITE', rowVersion: an.rowVersion }),
      await outsider.agent.get(api(`files/nomination:${an.id}/url`)),
      await outsider.agent.post(api(`jds/${seed.jdIds[1]}/supplement-requests`)).send({ note: 'Cần thêm' }),
    ]) {
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain(String(seed.studentCodes[AN]));
    }
    // The CV itself stays out of HR's reach by its own id (a CV has no company), even for the owner.
    const [cv] = await t.db.select({ id: cvs.id }).from(cvs).where(eq(cvs.studentId, seed.studentIds[AN]!));
    await hr.agent.get(api(`files/cv:${cv!.id}/url`)).expect(404);
    // Students do not reach HR routes.
    const student = await t.loginAs('STUDENT', { studentId: seed.studentIds[AN] });
    await student.agent.get(api(`nominations/${an.id}`)).expect(403);
    await decide(student, an.id, { decision: 'INVITE', rowVersion: an.rowVersion }).expect(403);
    // HR does not read a draft's nominations, even of its own JD.
    const draft = await prdRound({ draft: true });
    await draft.hr.agent.get(api(`nominations/${draft.nominationOf(AN).id}`)).expect(404);
    await draft.hr.agent.get(api(`files/nomination:${draft.nominationOf(AN).id}/url`)).expect(404);
    // The owner still reads it.
    await hr.agent.get(api(`nominations/${an.id}`)).expect(200);
  });

  it('GĐ8 INVITE moves NOMINATED → INTERVIEW with hr_review and audit in one transaction (AC-5)', async () => {
    const { seed, hr, nominationOf } = await prdRound();
    const binh = nominationOf(BINH);
    const result = HrDecisionResultSchema.parse(
      (await decide(hr, binh.id, { decision: 'INVITE', rowVersion: binh.rowVersion }).expect(200)).body,
    );
    expect(result).toMatchObject({ nominationId: binh.id, status: 'INTERVIEW', rowVersion: binh.rowVersion + 1 });
    expect(result.review).toMatchObject({ decision: 'INVITE', reasonCode: null, note: null });

    const [row] = await t.db.select().from(nominations).where(eq(nominations.id, binh.id));
    expect(row!.status).toBe('INTERVIEW');
    expect(await statusOf(binh.preferenceId)).toBe('INTERVIEW');
    const [review] = await t.db.select().from(hrReviews).where(eq(hrReviews.nominationId, binh.id));
    expect(review).toMatchObject({ reviewerId: hr.user.id, decision: 'INVITE', reasonCode: null });
    const audits = await auditEntries(t.db, 'nomination', binh.id);
    expect(audits.map((entry) => entry.action)).toEqual(expect.arrayContaining(['TRANSITION', 'HR_REVIEW_DECIDED']));
    expect((await auditEntries(t.db, 'application', binh.preferenceId))[0]).toMatchObject({
      action: 'TRANSITION',
      after: { status: 'INTERVIEW' },
    });

    // The student sees "Mời phỏng vấn" on the Đề cử page.
    const student = await t.loginAs('STUDENT', { studentId: seed.studentIds[BINH] });
    const mine = MyAllocationResultsSchema.parse((await student.agent.get(api('me/allocation-results')).expect(200)).body);
    expect(mine.items[0]!.nomination).toMatchObject({ nominationId: binh.id, status: 'INTERVIEW' });
  });

  it('BR-12 REJECT requires reason_code and note; student sees generic reason only (AC-6)', async () => {
    const { seed, hr, nominationOf } = await prdRound();
    const an = nominationOf(AN);
    const base = { decision: 'REJECT', rowVersion: an.rowVersion };
    // The schema's cases (no reason, a reason outside the catalogue, a blank note) are unit tests of
    // @srm/shared; here the route answers 400 and changes nothing.
    expect(errorOf(await decide(hr, an.id, { ...base, note: 'Thiếu kinh nghiệm SQL' }).expect(400)).code).toBe('VALIDATION_FAILED');
    expect(await statusOf(an.preferenceId)).toBe('NOMINATED');
    const note = 'Chưa có kinh nghiệm SQL nâng cao';
    await decide(hr, an.id, { ...base, reasonCode: 'MISSING_SKILLS', note }).expect(200);
    const [review] = await t.db.select().from(hrReviews).where(eq(hrReviews.nominationId, an.id));
    expect(review).toMatchObject({ decision: 'REJECT', reasonCode: 'MISSING_SKILLS', note });
    expect(await statusOf(an.preferenceId)).toBe('HR_REJECTED');
    // An's other preference (NV1 = JD A) waits for the next round.
    expect(await statusOf(seed.preferenceIds[AN]![0]!)).toBe('WAITING_NEXT_ROUND');

    const student = await t.loginAs('STUDENT', { studentId: seed.studentIds[AN] });
    const res = await student.agent.get(api('me/nomination-reviews')).expect(200);
    expect(MyNominationReviewsSchema.parse(res.body).items).toEqual([
      { nominationId: an.id, decision: 'REJECT', reasonCode: 'MISSING_SKILLS' },
    ]);
    expect(JSON.stringify(res.body)).not.toContain(note);
    // Another student sees nothing of it.
    const chi = await t.loginAs('STUDENT', { studentId: seed.studentIds[CHI] });
    expect(MyNominationReviewsSchema.parse((await chi.agent.get(api('me/nomination-reviews')).expect(200)).body).items).toEqual([]);
  });

  it('AD-8 second decision → 409; concurrent decisions → one wins (AC-7, Invariant 11)', async () => {
    const { seed, nominationOf } = await prdRound();
    const [hr1, hr2] = [await t.loginAs('HR', { companyId: seed.companyId }), await t.loginAs('HR', { companyId: seed.companyId })];
    const chi = nominationOf(CHI);
    const results = await Promise.all([
      decide(hr1, chi.id, { decision: 'INVITE', rowVersion: chi.rowVersion }),
      decide(hr2, chi.id, { decision: 'REJECT', rowVersion: chi.rowVersion, reasonCode: 'OTHER', note: 'Không phù hợp' }),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(errorOf(results.find((res) => res.status === 409)!).code).toBe('ROW_VERSION_CONFLICT');
    expect(await t.db.select().from(hrReviews).where(eq(hrReviews.nominationId, chi.id))).toHaveLength(1);

    // A second decision at the current version: already decided.
    const [current] = await t.db.select().from(nominations).where(eq(nominations.id, chi.id));
    const again = await decide(hr1, chi.id, { decision: 'INVITE', rowVersion: current!.rowVersion }).expect(409);
    expect(errorOf(again).code).toBe('NOMINATION_ALREADY_DECIDED');

    // The database refuses a second review and a rejection without its reason (Invariant 11).
    await expect(
      t.db.insert(hrReviews).values({ nominationId: chi.id, reviewerId: hr1.user.id, decision: 'INVITE', decidedAt: new Date() }),
    ).rejects.toMatchObject({ cause: { constraint: 'hr_reviews_nomination_id_key' } });
    const an = nominationOf(AN);
    await expect(
      t.db.insert(hrReviews).values({ nominationId: an.id, reviewerId: hr1.user.id, decision: 'REJECT', note: 'x', decidedAt: new Date() }),
    ).rejects.toMatchObject({ cause: { constraint: 'hr_reviews_reason_check' } });
  });

  it('GĐ8 supplement request only when invited < quota (AC-9)', async () => {
    const { seed, hr, nominationOf } = await prdRound();
    const [jdA, jdB] = seed.jdIds as [number, number];
    await hr.agent.post(api(`jds/${jdB}/supplement-requests`)).send({ note: ' ' }).expect(400);

    const created = SupplementRequestSchema.parse(
      (await hr.agent.post(api(`jds/${jdB}/supplement-requests`)).send({ note: 'Cần thêm 1 hồ sơ backend' }).expect(201)).body,
    );
    expect(created).toMatchObject({ jdId: jdB, invitedCount: 0, quota: 2 });
    const notices = await notificationsOfType(t.db, 'SUPPLEMENT_REQUESTED', center.user.id);
    expect(notices.filter((row) => (row.payload as { jd: { jdId: number } }).jd.jdId === jdB)).toHaveLength(1);
    expect((await auditEntries(t.db, 'job_description', jdB))[0]).toMatchObject({ action: 'SUPPLEMENT_REQUESTED' });
    const again = await hr.agent.post(api(`jds/${jdB}/supplement-requests`)).send({ note: 'Lần nữa' }).expect(409);
    expect(errorOf(again)).toMatchObject({ code: 'SUPPLEMENT_NOT_ALLOWED', details: { blockedBy: 'ALREADY_REQUESTED' } });
    expect(JdNominationListSchema.parse((await list(hr, jdB).expect(200)).body).supplement).toMatchObject({
      blockedBy: 'ALREADY_REQUESTED',
      requestedAt: created.createdAt,
    });

    // JD A (quota 1): once Bình is invited, invited ≥ quota.
    const binh = nominationOf(BINH);
    await decide(hr, binh.id, { decision: 'INVITE', rowVersion: binh.rowVersion }).expect(200);
    const full = await hr.agent.post(api(`jds/${jdA}/supplement-requests`)).send({ note: 'Cần thêm' }).expect(409);
    expect(errorOf(full)).toMatchObject({ code: 'SUPPLEMENT_NOT_ALLOWED', details: { blockedBy: 'QUOTA_REACHED' } });
    expect(JdNominationListSchema.parse((await list(hr, jdA).expect(200)).body)).toMatchObject({
      invitedCount: 1,
      supplement: { blockedBy: 'QUOTA_REACHED' },
    });
  });

  describe('GĐ8 SLA (AC-10)', () => {
    // 2003-03-03 is a Monday: SLA_HR 5 → due Monday 2003-03-10 10:00; reminder from Thursday 03-06 10:00.
    const PUBLISHED = vn('2003-03-03T10:00:00');

    async function backdatedRound() {
      const fixture = await prdRound();
      await t.db.update(allocationRounds).set({ publishedAt: PUBLISHED }).where(eq(allocationRounds.id, fixture.roundId));
      return fixture;
    }

    const ofJd = (rows: { payload: unknown }[], jdId: number) =>
      rows.filter((row) => (row.payload as { jd: { jdId: number } }).jd.jdId === jdId);

    it('GĐ8 SLA reminder once at 2 working days; overdue notifies HR and CENTER once; no automatic decision', async () => {
      const { seed, hr, nominationOf } = await backdatedRound();
      const scheduler = t.app.get(ReviewSlaScheduler);
      const jdB = seed.jdIds[1]!;

      clock.set(vn('2003-03-06T09:59:00'));
      await scheduler.runOnce();
      expect(ofJd(await notificationsOfType(t.db, 'HR_REVIEW_DUE_SOON', hr.user.id), jdB)).toHaveLength(0);

      clock.set(vn('2003-03-06T10:00:00'));
      // Two instances at once: one holds the lock, the dedupe key stops any repeat.
      const runs = await Promise.all([scheduler.runOnce(), scheduler.runOnce()]);
      expect(runs.some((run) => run.acquired)).toBe(true);
      await scheduler.runOnce();
      const reminders = ofJd(await notificationsOfType(t.db, 'HR_REVIEW_DUE_SOON', hr.user.id), jdB);
      expect(reminders).toHaveLength(1);
      expect(reminders[0]!.payload).toMatchObject({ dueAt: vn('2003-03-10T10:00:00').toISOString(), pendingCount: 2 });
      // Only the HR of the company hears the reminder.
      expect(ofJd(await notificationsOfType(t.db, 'HR_REVIEW_DUE_SOON', center.user.id), jdB)).toHaveLength(0);

      clock.set(vn('2003-03-10T10:00:00'));
      await scheduler.runOnce();
      await scheduler.runOnce();
      expect(ofJd(await notificationsOfType(t.db, 'HR_REVIEW_OVERDUE', hr.user.id), jdB)).toHaveLength(1);
      const centerNotices = ofJd(await notificationsOfType(t.db, 'HR_REVIEW_OVERDUE', center.user.id), jdB);
      expect(centerNotices).toHaveLength(1);
      expect(centerNotices[0]!.payload).toMatchObject({ audience: 'CENTER' });
      // BR-13: a passed deadline decides nothing.
      const [row] = await t.db.select().from(nominations).where(eq(nominations.id, nominationOf(AN).id));
      expect(row!.status).toBe('NOMINATED');
    });

    it('GĐ8 extension requires reason, moves the deadline and the next reminder', async () => {
      const { seed, hr, roundId } = await backdatedRound();
      const scheduler = t.app.get(ReviewSlaScheduler);
      const jdB = seed.jdIds[1]!;
      clock.set(vn('2003-03-10T11:00:00'));
      await scheduler.runOnce(); // overdue for the first deadline
      const extend = (body: Record<string, unknown>) => center.agent.post(api(`jds/${jdB}/review-deadline-extensions`)).send(body);

      await extend({ roundId, dueAt: vn('2003-03-14T10:00:00').toISOString() }).expect(400);
      await hr.agent
        .post(api(`jds/${jdB}/review-deadline-extensions`))
        .send({ roundId, dueAt: vn('2003-03-14T10:00:00').toISOString(), reason: 'HR xin thêm thời gian' })
        .expect(403);
      // Not later than the current deadline (10/03 10:00) and now.
      const early = await extend({ roundId, dueAt: vn('2003-03-10T10:30:00').toISOString(), reason: 'Gia hạn' }).expect(422);
      expect(errorOf(early).code).toBe('REVIEW_DEADLINE_NOT_LATER');

      const extended = ReviewDeadlineSchema.parse(
        (await extend({ roundId, dueAt: vn('2003-03-14T10:00:00').toISOString(), reason: 'HR xin thêm thời gian' }).expect(201))
          .body,
      );
      expect(extended).toMatchObject({ roundId, jdId: jdB, extended: true, pendingCount: 2, nominationCount: 2 });
      expect((await auditEntries(t.db, 'job_description', jdB))[0]).toMatchObject({
        action: 'REVIEW_DEADLINE_EXTENDED',
        reason: 'HR xin thêm thời gian',
      });
      const deadlines = ReviewDeadlineListSchema.parse((await center.agent.get(api(`allocation-rounds/${roundId}/review-deadlines`)).expect(200)).body);
      expect(deadlines.items.find((item) => item.jdId === jdB)).toMatchObject({ dueAt: vn('2003-03-14T10:00:00').toISOString() });
      expect(JdNominationListSchema.parse((await list(hr, jdB).expect(200)).body).items[0]!.reviewDueAt).toBe(
        vn('2003-03-14T10:00:00').toISOString(),
      );

      // The new deadline is reminded again, 2 working days before it (Wednesday 12/03).
      clock.set(vn('2003-03-12T10:00:00'));
      await scheduler.runOnce();
      const reminders = ofJd(await notificationsOfType(t.db, 'HR_REVIEW_DUE_SOON', hr.user.id), jdB);
      expect(reminders.map((row) => (row.payload as { dueAt: string }).dueAt)).toContain(vn('2003-03-14T10:00:00').toISOString());
    });
  });
});
