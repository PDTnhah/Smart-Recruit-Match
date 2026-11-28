// US-5.4 (GĐ9, FR-30, FR-31, BR-11, BR-13…BR-16, AD-8, AGENTS › Invariants 7, 10, 11): HR schedules
// an interview for a nomination it invited, the student confirms or asks once for another time, HR
// records the result; PASSED gets an offer with a server deadline, a full JD puts the rest on the
// reserve list, an answer or an expiry moves the places. Rounds are seeded with
// test/helpers/allocation.ts, run and published through the API, every nomination invited by HR.
// Only this file calls InterviewSweepScheduler.runOnce() (LESSONS §22); the clock is a FakeClock at
// real time, moved forward for expiries.
import {
  ApiErrorSchema,
  InterviewResultResponseSchema,
  InterviewViewSchema,
  JdInterviewListSchema,
  MyInterviewsSchema,
  OfferAnswerResponseSchema,
  StaffInterviewViewSchema,
  type InterviewResult,
  type StaffInterviewView,
} from '@srm/shared';
import { eq, sql } from 'drizzle-orm';
import { Clock } from '../../src/common/clock/index.js';
import { campaigns, interviews, jobDescriptions, nominations, offers, preferences } from '../../src/db/schema/index.js';
import { InterviewSweepScheduler } from '../../src/modules/interview/index.js';
import { type SeedOptions, seedAllocationCampaign } from '../helpers/allocation.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { FakeClock } from '../helpers/fake-clock.js';
import { notificationsOfType } from '../helpers/notifications.js';
import { auditEntries } from '../helpers/state.js';

type Response = { body: unknown };
const errorOf = (response: Response) => ApiErrorSchema.parse(response.body);
const DAY = 86_400_000;

describe('GĐ9 interviews, reserves and offers (US-5.4)', () => {
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

  /**
   * One JD of `quota` and students by S_final (each also prefers a second JD, so BR-15 has a
   * preference to close); round 1 published, every nomination invited by HR of the company.
   */
  async function invited(sFinals: number[], quota = 1) {
    const options: SeedOptions = {
      quotas: [quota, 5],
      k: Math.max(1, sFinals.length / quota),
      students: sFinals.map((sFinal) => ({
        prefs: [
          { jd: 0, sFinal, sTest: sFinal },
          { jd: 1, sFinal: sFinal - 20, sTest: sFinal - 20 },
        ],
      })),
    };
    const seed = await seedAllocationCampaign(t.db, options);
    const ran = await center.agent.post(api(`campaigns/${seed.campaignId}/allocation-rounds`)).send({ rowVersion: null }).expect(201);
    const { id: roundId, rowVersion } = ran.body as { id: number; rowVersion: number };
    await center.agent.post(api(`allocation-rounds/${roundId}/publish`)).send({ rowVersion }).expect(200);
    const hr = await t.loginAs('HR', { companyId: seed.companyId });
    const rows = await t.db.select().from(nominations).where(eq(nominations.roundId, roundId));
    expect(rows.every((row) => row.jdId === seed.jdIds[0])).toBe(true);
    for (const row of rows) {
      await hr.agent.post(api(`nominations/${row.id}/decision`)).send({ decision: 'INVITE', rowVersion: row.rowVersion }).expect(200);
    }
    const nominationOf = (student: number) => rows.find((row) => row.studentId === seed.studentIds[student])!.id;
    const students: LoggedIn[] = [];
    for (const studentId of seed.studentIds) students.push(await t.loginAs('STUDENT', { studentId }));
    return { seed, hr, students, nominationOf, jdId: seed.jdIds[0]! };
  }

  const later = (days = 1) => new Date(clock.now().getTime() + days * DAY).toISOString();
  const slotOf = (nominationId: number) => ({ nominationId, scheduledAt: later(), mode: 'ONLINE', location: 'https://meet.example.com/abc' });

  async function schedule(hr: LoggedIn, nominationId: number): Promise<StaffInterviewView> {
    return StaffInterviewViewSchema.parse((await hr.agent.post(api('interviews')).send(slotOf(nominationId)).expect(201)).body);
  }

  const result = (hr: LoggedIn, interview: { interviewId: number; rowVersion: number }, value: InterviewResult) =>
    hr.agent.put(api(`interviews/${interview.interviewId}/result`)).send({ result: value, note: 'Nhận xét', rowVersion: interview.rowVersion });

  async function passed(hr: LoggedIn, nominationId: number) {
    const interview = await schedule(hr, nominationId);
    return InterviewResultResponseSchema.parse((await result(hr, interview, 'PASSED').expect(200)).body);
  }

  const nominationStatus = async (id: number) =>
    (await t.db.select({ status: nominations.status }).from(nominations).where(eq(nominations.id, id)))[0]!.status;
  const preferencesOf = (studentId: number) =>
    t.db.select({ id: preferences.id, jdId: preferences.jdId, status: preferences.status }).from(preferences).where(eq(preferences.studentId, studentId));
  const offerOf = async (nominationId: number) => (await t.db.select().from(offers).where(eq(offers.nominationId, nominationId)))[0];
  const accept = (student: LoggedIn, offer: { offerId: number; rowVersion: number }) =>
    student.agent.post(api(`offers/${offer.offerId}/accept`)).send({ rowVersion: offer.rowVersion });
  const decline = (student: LoggedIn, offer: { offerId: number; rowVersion: number }) =>
    student.agent.post(api(`offers/${offer.offerId}/decline`)).send({ rowVersion: offer.rowVersion });
  const sweep = () => t.app.get(InterviewSweepScheduler).runOnce();

  it('GĐ9 HR schedules interview for INTERVIEW nomination; duplicate → 409 (AC-1)', async () => {
    const { hr, students, nominationOf } = await invited([90]);
    const interview = await schedule(hr, nominationOf(0));
    expect(interview).toMatchObject({ nominationId: nominationOf(0), status: 'SCHEDULED', mode: 'ONLINE', confirmedAt: null });
    const [row] = await t.db.select().from(interviews).where(eq(interviews.id, interview.interviewId));
    expect(row).toMatchObject({ createdBy: hr.user.id, location: 'https://meet.example.com/abc' });
    for (const user of [students[0]!, hr]) {
      const [notice] = await notificationsOfType(t.db, 'INTERVIEW_SCHEDULED', user.user.id);
      expect(notice).toMatchObject({ channels: ['IN_APP'], payload: { interviewId: interview.interviewId } });
    }

    const again = await hr.agent.post(api('interviews')).send(slotOf(nominationOf(0))).expect(409);
    expect(errorOf(again).code).toBe('INTERVIEW_ALREADY_SCHEDULED');
    const past = await hr.agent.post(api('interviews')).send({ ...slotOf(nominationOf(0)), scheduledAt: new Date(clock.now().getTime() - 60_000).toISOString() });
    expect(past.status).toBe(422);
    expect(errorOf(past).code).toBe('INTERVIEW_TIME_NOT_FUTURE');

    // A nomination HR has not invited (still NOMINATED) has no interview.
    const other = await seedAllocationCampaign(t.db, { quotas: [1], students: [{ prefs: [{ jd: 0, sFinal: 80, sTest: 80 }] }] });
    const ran = await center.agent.post(api(`campaigns/${other.campaignId}/allocation-rounds`)).send({ rowVersion: null }).expect(201);
    const round = ran.body as { id: number; rowVersion: number };
    await center.agent.post(api(`allocation-rounds/${round.id}/publish`)).send({ rowVersion: round.rowVersion }).expect(200);
    const otherHr = await t.loginAs('HR', { companyId: other.companyId });
    const [nominated] = await t.db.select().from(nominations).where(eq(nominations.roundId, round.id));
    const notInvited = await otherHr.agent.post(api('interviews')).send(slotOf(nominated!.id)).expect(409);
    expect(errorOf(notInvited).code).toBe('NOMINATION_NOT_IN_INTERVIEW');
  });

  it('GĐ9 student confirms; reschedule request allowed once; stale row_version → 409 (AC-2, AC-11)', async () => {
    const { hr, students, nominationOf } = await invited([90]);
    const student = students[0]!;
    const created = await schedule(hr, nominationOf(0));
    const confirmed = InterviewViewSchema.parse(
      (await student.agent.post(api(`interviews/${created.interviewId}/confirm`)).send({ rowVersion: created.rowVersion }).expect(200)).body,
    );
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.confirmedAt).not.toBeNull();

    // AC-11: HR moves the interview with the version from before the student confirmed.
    const stale = await hr.agent.put(api(`interviews/${created.interviewId}`)).send({ ...slotOf(0), rowVersion: created.rowVersion });
    expect(stale.status).toBe(409);
    expect(errorOf(stale).code).toBe('ROW_VERSION_CONFLICT');

    const requested = InterviewViewSchema.parse(
      (
        await student.agent
          .post(api(`interviews/${created.interviewId}/reschedule-request`))
          .send({ rowVersion: confirmed.rowVersion, note: 'Trùng lịch thi' })
          .expect(200)
      ).body,
    );
    expect(requested).toMatchObject({ status: 'RESCHEDULE_REQUESTED', rescheduleNote: 'Trùng lịch thi' });
    const [request] = await notificationsOfType(t.db, 'INTERVIEW_RESCHEDULE_REQUESTED', hr.user.id);
    expect(request).toMatchObject({ payload: { interviewId: created.interviewId, note: 'Trùng lịch thi' } });

    const newTime = later(2);
    const moved = StaffInterviewViewSchema.parse(
      (
        await hr.agent
          .put(api(`interviews/${created.interviewId}`))
          .send({ scheduledAt: newTime, mode: 'OFFLINE', location: 'Phòng 301', rowVersion: requested.rowVersion })
          .expect(200)
      ).body,
    );
    expect(moved).toMatchObject({ status: 'SCHEDULED', mode: 'OFFLINE', location: 'Phòng 301', confirmedAt: null });
    expect(moved.scheduledAt).toBe(newTime);
    for (const user of [student, hr]) {
      expect(await notificationsOfType(t.db, 'INTERVIEW_RESCHEDULED', user.user.id)).toHaveLength(1);
    }

    const second = await student.agent
      .post(api(`interviews/${created.interviewId}/reschedule-request`))
      .send({ rowVersion: moved.rowVersion, note: 'Lần nữa' });
    expect(second.status).toBe(409);
    expect(errorOf(second).code).toBe('INTERVIEW_RESCHEDULE_ALREADY_REQUESTED');
    const audits = await auditEntries(t.db, 'interview', created.interviewId);
    expect(audits.map((entry) => entry.after)).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'CONFIRMED' }), expect.objectContaining({ status: 'SCHEDULED' })]),
    );
  });

  it('BR-13 HR records PASSED/RESERVE/FAILED/ABSENT; ABSENT treated as FAILED; PASSED gets an offer (AC-3, AC-5)', async () => {
    const { seed, hr, students, nominationOf } = await invited([90, 85, 80, 75, 70, 65], 2);
    const first = await passed(hr, nominationOf(0));
    expect(first).toMatchObject({ nominationStatus: 'PASSED', reservedForQuota: false, interview: { status: 'DONE', result: 'PASSED', resultNote: 'Nhận xét' } });
    // AC-5: the deadline is the server's: sent_at + T_offer (3 days).
    const offer = await offerOf(nominationOf(0));
    expect(offer!.expiresAt.getTime() - offer!.sentAt.getTime()).toBe(3 * DAY);
    expect(first.offer).toMatchObject({ offerId: offer!.id, status: 'PENDING' });
    const [notice] = await notificationsOfType(t.db, 'INTERVIEW_RESULT', students[0]!.user.id);
    expect(notice).toMatchObject({ payload: { status: 'PASSED', promoted: false, offer: { offerId: offer!.id } } });

    // BR-14 (CONTEXT D66): no RESERVE while a place is free; nothing moves, HR passes the student.
    const early = await schedule(hr, nominationOf(1));
    const refused = await result(hr, early, 'RESERVE');
    expect(refused.status).toBe(409);
    expect(errorOf(refused).code).toBe('INTERVIEW_RESERVE_PLACES_LEFT');
    expect(InterviewResultResponseSchema.parse((await result(hr, early, 'PASSED').expect(200)).body).nominationStatus).toBe('PASSED');
    const reserve = await schedule(hr, nominationOf(2));
    expect(InterviewResultResponseSchema.parse((await result(hr, reserve, 'RESERVE').expect(200)).body).nominationStatus).toBe('RESERVE');
    const failed = await schedule(hr, nominationOf(3));
    expect(InterviewResultResponseSchema.parse((await result(hr, failed, 'FAILED').expect(200)).body).nominationStatus).toBe('INTERVIEW_FAILED');
    const absent = await schedule(hr, nominationOf(4));
    const absentBody = InterviewResultResponseSchema.parse((await result(hr, absent, 'ABSENT').expect(200)).body);
    expect(absentBody).toMatchObject({ nominationStatus: 'INTERVIEW_FAILED', interview: { result: 'ABSENT' }, offer: null });

    // The preference follows its nomination; the other preference still waits for the next round.
    const statuses = await preferencesOf(seed.studentIds[4]!);
    expect(statuses.find((row) => row.jdId === seed.jdIds[0])!.status).toBe('INTERVIEW_FAILED');
    expect(statuses.find((row) => row.jdId === seed.jdIds[1])!.status).toBe('WAITING_NEXT_ROUND');
    const audit = await auditEntries(t.db, 'nomination', nominationOf(4));
    expect(audit.map((entry) => (entry.after as { status?: string } | null)?.status)).toContain('INTERVIEW_FAILED');

    // A second result is refused: the interview is DONE.
    const again = await result(hr, { interviewId: absent.interviewId, rowVersion: absentBody.interview.rowVersion }, 'PASSED');
    expect(again.status).toBe(409);
  });

  it('BR-14 PASSED beyond remaining quota becomes RESERVE (AC-4)', async () => {
    const { hr, nominationOf } = await invited([90, 85]);
    await passed(hr, nominationOf(0));
    const second = await passed(hr, nominationOf(1));
    expect(second).toMatchObject({ nominationStatus: 'RESERVE', reservedForQuota: true, interview: { result: 'RESERVE' }, offer: null });
    expect(second.slots).toEqual({ quota: 1, accepted: 0, passed: 1, reserve: 1 });
  });

  it('BR-14 concurrent PASSED for last slot: exactly one wins (AC-4)', async () => {
    const { seed, hr, nominationOf } = await invited([90, 85]);
    const otherHr = await t.loginAs('HR', { companyId: seed.companyId });
    const a = await schedule(hr, nominationOf(0));
    const b = await schedule(otherHr, nominationOf(1));
    const [ra, rb] = await Promise.all([result(hr, a, 'PASSED'), result(otherHr, b, 'PASSED')]);
    expect([ra.status, rb.status]).toEqual([200, 200]);
    const outcomes = [ra, rb].map((r) => InterviewResultResponseSchema.parse(r.body).nominationStatus).sort();
    expect(outcomes).toEqual(['PASSED', 'RESERVE']);
    expect((await t.db.select().from(offers).where(eq(offers.nominationId, nominationOf(0)))).length +
      (await t.db.select().from(offers).where(eq(offers.nominationId, nominationOf(1)))).length).toBe(1);
  });

  it('BR-15 accept closes other preferences, fills the JD and closes its reserves (AC-6, AC-9)', async () => {
    const { seed, hr, students, nominationOf, jdId } = await invited([90, 85]);
    const first = await passed(hr, nominationOf(0));
    await passed(hr, nominationOf(1)); // RESERVE: no place left
    const body = OfferAnswerResponseSchema.parse((await accept(students[0]!, first.offer!).expect(200)).body);
    expect(body).toMatchObject({ nominationStatus: 'ACCEPTED', offer: { status: 'ACCEPTED' } });
    expect(await nominationStatus(nominationOf(0))).toBe('ACCEPTED');
    const own = await preferencesOf(seed.studentIds[0]!);
    expect(own.find((row) => row.jdId === jdId)!.status).toBe('ACCEPTED');
    expect(own.find((row) => row.jdId === seed.jdIds[1])!.status).toBe('CLOSED');
    // Quota 1 accepted: the JD is FILLED and the reserve closes at once.
    const [jd] = await t.db.select({ status: jobDescriptions.status }).from(jobDescriptions).where(eq(jobDescriptions.id, jdId));
    expect(jd!.status).toBe('FILLED');
    expect(await nominationStatus(nominationOf(1))).toBe('CLOSED');
    const [closed] = await notificationsOfType(t.db, 'RESERVE_CLOSED', students[1]!.user.id);
    expect(closed).toMatchObject({ payload: { reason: 'JD_FILLED' } });
    for (const user of [hr, center]) {
      const notices = await notificationsOfType(t.db, 'OFFER_ANSWERED', user.user.id);
      expect(notices.find((n) => (n.payload as { offerId: number }).offerId === first.offer!.offerId)).toMatchObject({
        payload: { response: 'ACCEPTED', jdFilled: true },
      });
    }
    const list = JdInterviewListSchema.parse((await hr.agent.get(api(`jds/${jdId}/interviews`)).expect(200)).body);
    expect(list.slots).toEqual({ quota: 1, accepted: 1, passed: 0, reserve: 0 });
    expect(list.items.map((item) => item.nominationStatus)).toEqual(['ACCEPTED', 'CLOSED']);
  });

  it('BR-16 decline or expiry frees slot and promotes top RESERVE (AC-7)', async () => {
    const { hr, students, nominationOf } = await invited([90, 80, 85]);
    const first = await passed(hr, nominationOf(0));
    await passed(hr, nominationOf(1)); // RESERVE, S_final 80
    await passed(hr, nominationOf(2)); // RESERVE, S_final 85: ranks first of the reserves
    const declined = OfferAnswerResponseSchema.parse((await decline(students[0]!, first.offer!).expect(200)).body);
    expect(declined).toMatchObject({ nominationStatus: 'DECLINED', offer: { status: 'DECLINED' } });
    expect(await nominationStatus(nominationOf(2))).toBe('PASSED');
    expect(await nominationStatus(nominationOf(1))).toBe('RESERVE');
    const promotedOffer = await offerOf(nominationOf(2));
    expect(promotedOffer).toMatchObject({ status: 'PENDING' });
    // The student heard RESERVE first, then the promotion with the offer.
    const results = await notificationsOfType(t.db, 'INTERVIEW_RESULT', students[2]!.user.id);
    expect(results.map((n) => n.payload)).toMatchObject([
      { status: 'RESERVE', promoted: false, offer: null },
      { status: 'PASSED', promoted: true, offer: { offerId: promotedOffer!.id } },
    ]);
    const [answered] = (await notificationsOfType(t.db, 'OFFER_ANSWERED', hr.user.id)).filter(
      (n) => (n.payload as { offerId: number }).offerId === first.offer!.offerId,
    );
    expect(answered?.payload).toMatchObject({ response: 'DECLINED' });
    expect((answered?.payload as { promoted: { studentCode: string } | null }).promoted).not.toBeNull();

    // The promoted student lets the offer expire: the sweep expires it and promotes the next one.
    clock.set(new Date(promotedOffer!.expiresAt.getTime() + 1));
    const report = await sweep();
    expect(report.expiredOffers).toContain(promotedOffer!.id);
    expect((await offerOf(nominationOf(2)))!.status).toBe('EXPIRED');
    expect(await nominationStatus(nominationOf(2))).toBe('DECLINED');
    expect(await nominationStatus(nominationOf(1))).toBe('PASSED');
  });

  it('GĐ9 accept after expiry → 409; concurrent answers yield one outcome; sweep skips an answered offer (AC-8)', async () => {
    const { hr, students, nominationOf } = await invited([90, 85], 2);
    const first = await passed(hr, nominationOf(0));
    clock.set(new Date(Date.parse(first.offer!.expiresAt)));
    const late = await accept(students[0]!, first.offer!);
    expect(late.status).toBe(409);
    expect(errorOf(late).code).toBe('OFFER_EXPIRED');
    expect(await nominationStatus(nominationOf(0))).toBe('PASSED');
    clock.set(new Date());

    const second = await passed(hr, nominationOf(1));
    const [a, d] = await Promise.all([accept(students[1]!, second.offer!), decline(students[1]!, second.offer!)]);
    expect([a.status, d.status].sort()).toEqual([200, 409]);
    const answered = await offerOf(nominationOf(1));
    const status = await nominationStatus(nominationOf(1));
    expect([answered!.status, status]).toEqual(answered!.status === 'ACCEPTED' ? ['ACCEPTED', 'ACCEPTED'] : ['DECLINED', 'DECLINED']);

    // The sweep after the deadline leaves an answered offer as it is.
    clock.set(new Date(answered!.expiresAt.getTime() + 1));
    await sweep();
    expect((await offerOf(nominationOf(1)))!.status).toBe(answered!.status);
    expect((await offerOf(nominationOf(0)))!.status).toBe('EXPIRED');
  });

  it('GĐ9 RESERVE closes after reserve TTL (AC-9)', async () => {
    // One place, offered to the first student (3 days); the second goes to the reserve list. A 1-day
    // reserve time runs out while the offer still holds the place, so only the sweep closes it.
    const { seed, hr, students, nominationOf } = await invited([90, 85]);
    await t.db
      .update(campaigns)
      .set({ config: sql`${campaigns.config} || '{"reserve_ttl_days": 1}'::jsonb` })
      .where(eq(campaigns.id, seed.campaignId));
    await passed(hr, nominationOf(0));
    const reserve = await passed(hr, nominationOf(1));
    expect(reserve.nominationStatus).toBe('RESERVE');
    clock.set(new Date(Date.parse(reserve.interview.resultAt!) + DAY - 60_000));
    await sweep();
    expect(await nominationStatus(nominationOf(1))).toBe('RESERVE');
    clock.advance({ minutes: 2 });
    const report = await sweep();
    expect(report.closedReserves).toContainEqual({ nominationId: nominationOf(1), reason: 'RESERVE_EXPIRED' });
    expect(await nominationStatus(nominationOf(1))).toBe('CLOSED');
    const own = await preferencesOf(seed.studentIds[1]!);
    expect(own.find((row) => row.jdId === seed.jdIds[0])!.status).toBe('CLOSED');
    expect(own.find((row) => row.jdId === seed.jdIds[1])!.status).toBe('WAITING_NEXT_ROUND');
    const [notice] = await notificationsOfType(t.db, 'RESERVE_CLOSED', students[1]!.user.id);
    expect(notice).toMatchObject({ payload: { reason: 'RESERVE_EXPIRED' } });
  });

  it('GĐ9 a freed place skips a RESERVE past its TTL and closes it (AC-7, AC-9)', async () => {
    const { hr, students, nominationOf } = await invited([90, 85]);
    const first = await passed(hr, nominationOf(0));
    const reserve = await passed(hr, nominationOf(1)); // RESERVE: no place left
    expect(reserve.nominationStatus).toBe('RESERVE');
    // The reserve's 7 days run out in the same minute the sweep expires the offer that frees the place.
    clock.set(new Date(Date.parse(reserve.interview.resultAt!) + 7 * DAY + 30_000));
    const report = await sweep();
    expect(report.expiredOffers).toContain(first.offer!.offerId);
    expect(await nominationStatus(nominationOf(1))).toBe('CLOSED');
    expect(await offerOf(nominationOf(1))).toBeUndefined();
    const [notice] = await notificationsOfType(t.db, 'RESERVE_CLOSED', students[1]!.user.id);
    expect(notice).toMatchObject({ payload: { reason: 'RESERVE_EXPIRED' } });
  });

  it('BR-11 HR of another company → 404; student acts only on own interview and offer; wrong role → 403 (AC-10)', async () => {
    const { hr, students, nominationOf, jdId } = await invited([90, 85], 2);
    const interview = await schedule(hr, nominationOf(0));
    const outsider = await t.loginAs('HR');
    for (const res of [
      await outsider.agent.post(api('interviews')).send(slotOf(nominationOf(1))),
      await outsider.agent.put(api(`interviews/${interview.interviewId}`)).send({ ...slotOf(0), rowVersion: interview.rowVersion }),
      await result(outsider, interview, 'PASSED'),
      await outsider.agent.get(api(`jds/${jdId}/interviews`)),
    ]) {
      expect(res.status).toBe(404);
    }
    const otherStudent = students[1]!;
    for (const res of [
      await otherStudent.agent.post(api(`interviews/${interview.interviewId}/confirm`)).send({ rowVersion: interview.rowVersion }),
      await otherStudent.agent.post(api(`interviews/${interview.interviewId}/reschedule-request`)).send({ rowVersion: 0, note: 'x' }),
    ]) {
      expect(res.status).toBe(404);
    }
    const done = InterviewResultResponseSchema.parse((await result(hr, interview, 'PASSED').expect(200)).body);
    expect((await accept(otherStudent, done.offer!)).status).toBe(404);
    expect((await decline(otherStudent, done.offer!)).status).toBe(404);

    // Roles: the student never schedules, HR never answers an offer, the center only reads.
    expect((await students[0]!.agent.post(api('interviews')).send(slotOf(nominationOf(1)))).status).toBe(403);
    expect((await accept(hr, done.offer!)).status).toBe(403);
    expect((await result(center, interview, 'PASSED')).status).toBe(403);
    const list = JdInterviewListSchema.parse((await center.agent.get(api(`jds/${jdId}/interviews`)).expect(200)).body);
    expect(list.items).toHaveLength(2);

    // The student's own list: the interview and the offer, with what declining means (Q4).
    const mine = MyInterviewsSchema.parse((await students[0]!.agent.get(api('me/interviews')).expect(200)).body);
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]).toMatchObject({ nominationId: nominationOf(0), offer: { status: 'PENDING' }, offerDeclinePolicy: 'DEMOTE' });
    expect(JSON.stringify(mine)).not.toContain('resultNote');
  });
});
