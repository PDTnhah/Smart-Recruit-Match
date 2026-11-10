// US-4.4 AC-1, AC-2, AC-4–AC-6, AC-11 (FR-22, AGENTS › Invariants 1, 10, 12, CONTEXT D53, LESSONS
// §33, §36): multiple choice graded when the session closes, the essays sent to the Grader once per
// session, each pass stored once and checked against the rubric, the handoff to a human grader, and
// the results published with S_final once the campaign is past testing_end. Only this file calls the grading sweep's runOnce(); its clock
// is in March 2000, away from every other file's campaigns (test/helpers/fake-clock.ts). Its
// published sessions all have the MCQ right (S_test ≥ 60), so the threshold sweep of
// threshold.int-spec.ts leaves them alone.
import type { TestingModuleBuilder } from '@nestjs/testing';
import { type AiJobInput, ApiErrorSchema, EssayGradingDispatchSchema } from '@srm/shared';
import { and, eq, sql } from 'drizzle-orm';
import { Clock } from '../../src/common/clock/index.js';
import { RowVersionConflictError } from '../../src/common/errors/index.js';
import { auditLogs, cvs, essayGradingRuns, jobDescriptions, preferences } from '../../src/db/schema/index.js';
import { AI_JOB_DISPATCHED, type AiJobDispatchedEvent, AiGatewayService } from '../../src/modules/aigateway/index.js';
import { EssayResultsHandler, GradingScheduler, GradingService } from '../../src/modules/assessment/index.js';
import { PreferenceGradingService } from '../../src/modules/matching/index.js';
import { api, type AuthTestApp, createAuthTestApp } from '../helpers/auth.js';
import { minutesAfter, sessionRow } from '../helpers/exam.js';
import { FakeClock } from '../helpers/fake-clock.js';
import {
  answersOf,
  createGradingFixture,
  essayResult,
  failedPass,
  GRADER_MODEL,
  GRADER_PROMPT,
  gradeItem,
  type GradingFixtureOptions,
  jobOfSession,
  takeExam,
} from '../helpers/grading.js';
import { captureEvents } from '../helpers/jd.js';
import { notificationsOfType } from '../helpers/notifications.js';
import { scorePair } from '../helpers/shortlist.js';
import { auditEntries } from '../helpers/state.js';

const START = '2000-03-06T08:00:00.000Z';

describe('GĐ6 grading (US-4.4)', () => {
  const clock = new FakeClock(START);
  let t: AuthTestApp;
  let scheduler: GradingScheduler;
  let handler: EssayResultsHandler;
  let dispatched: AiJobDispatchedEvent[];

  beforeAll(async () => {
    t = await createAuthTestApp({ configure: (b: TestingModuleBuilder) => b.overrideProvider(Clock).useValue(clock) });
    scheduler = t.app.get(GradingScheduler);
    handler = t.app.get(EssayResultsHandler);
    dispatched = captureEvents<AiJobDispatchedEvent>(t.app, AI_JOB_DISPATCHED);
  });

  beforeEach(() => clock.set(START));

  afterAll(() => t.close());

  const fixture = (options: Partial<GradingFixtureOptions> = {}) => createGradingFixture(t, { now: clock.now(), ...options });
  const preferenceRow = async (id: number) => {
    const [row] = await t.db.select().from(preferences).where(eq(preferences.id, id));
    return row!;
  };
  const runRow = async (id: number) => {
    const [row] = await t.db.select().from(essayGradingRuns).where(eq(essayGradingRuns.id, id));
    return row!;
  };
  const runsOfCampaign = (campaignId: number) =>
    t.db.select().from(essayGradingRuns).where(eq(essayGradingRuns.campaignId, campaignId));
  /** A campaign whose test window ends a day after the clock, and the moment just past it. */
  const window = () => {
    const testingEnd = minutesAfter(clock.now(), 24 * 60);
    return { testingEnd, after: new Date(Date.parse(testingEnd) + 60_000) };
  };
  const sendEarly = async (campaignId: number) => {
    const center = await t.loginAs('CENTER');
    const res = await center.agent.post(api(`campaigns/${campaignId}/essay-grading`)).send().expect(200);
    return EssayGradingDispatchSchema.parse(res.body);
  };

  it('GĐ6 closing grades multiple choice; essay job after testing_end; resend grades nothing twice', async () => {
    const testingEnd = minutesAfter(clock.now(), 24 * 60);
    const writer = await fixture({ testingEnd });
    const { campaignId } = writer;
    const mcqOnly = await fixture({ campaignId });
    const late = await fixture({ campaignId });
    const a = await takeExam(t, writer, { mcq: 'RIGHT', essays: ['Bài làm câu 2', 'Bài làm câu 3'] });
    const b = await takeExam(t, mcqOnly, { mcq: 'RIGHT', essays: [null, null] });
    const c = await takeExam(t, late, { mcq: 'WRONG', essays: ['Bài làm muộn', null] }, { submit: false });

    // AC-1: the close graded the MCQ by code; the essays wait for the Grader.
    const graded = await answersOf(t, a.sessionId);
    expect(graded.get(a.mcqId)).toMatchObject({ autoScore: 1, finalScore: 1 });
    expect(graded.get(a.essayIds[0])).toMatchObject({ autoScore: null, finalScore: null, aiGrading: null });

    // Before testing_end nothing is sent, and nothing is published, not even a session with no essay.
    let report = await scheduler.runOnce();
    expect(report.acquired).toBe(true);
    expect((await sessionRow(t.db, a.sessionId)).essayRunId).toBeNull();
    expect(report.published).not.toContain(b.sessionId);
    expect(await sessionRow(t.db, b.sessionId)).toMatchObject({ resultsPublishedAt: null, sTest: null });

    // Past testing_end with a session still open: the job waits for it; the session with no essay
    // is scored now (AC-2).
    clock.set(new Date(Date.parse(testingEnd) + 60_000));
    report = await scheduler.runOnce();
    expect((await sessionRow(t.db, a.sessionId)).essayRunId).toBeNull();
    expect(report.published).toContain(b.sessionId);
    expect(await sessionRow(t.db, b.sessionId)).toMatchObject({ scoreA: 100, scoreB: 0, sTest: 60, essayRunId: null });
    // S_final = 0.4 × 70 + 0.6 × 60, stored with the S_cv it came from.
    expect(await preferenceRow(mcqOnly.preferenceId)).toMatchObject({ status: 'TEST_GRADED', sCv: 70, sFinal: 64 });

    // The late student submits after the deadline (EXPIRED): now one job takes both sessions.
    await late.student.agent.post(api(`exam-sessions/${c.sessionId}/submit`)).send().expect(200);
    report = await scheduler.runOnce();
    const job = await jobOfSession(t, a.sessionId);
    expect(job.exam_session_ids).toEqual([a.sessionId, c.sessionId].sort((x, y) => x - y));
    expect(report.dispatched).toEqual(expect.arrayContaining([job.runId]));
    expect(await runRow(job.runId)).toMatchObject({
      campaignId,
      status: 'RUNNING',
      actorKind: 'SYSTEM',
      sessionCount: 2,
      dispatchedAt: expect.any(Date) as unknown,
    });
    expect(dispatched.filter((event) => event.jobId === job.job_id).map((event) => event.job)).toEqual([
      { job_id: job.job_id, exam_session_ids: job.exam_session_ids, prompt_version: null },
    ]);

    // Swept again: nothing new is sent. HR and students may not send.
    await scheduler.runOnce();
    expect(await runsOfCampaign(campaignId)).toHaveLength(1);
    const hr = await t.loginAs('HR');
    await hr.agent.post(api(`campaigns/${campaignId}/essay-grading`)).send().expect(403);
    await writer.student.agent.post(api(`campaigns/${campaignId}/essay-grading`)).send().expect(403);
  });

  it('GĐ6 CENTER sends early; a result that comes before dispatch returns is kept (LESSONS §33)', async () => {
    const { testingEnd, after } = window();
    const exam = await fixture({ testingEnd });
    const taken = await takeExam(t, exam, { mcq: 'RIGHT', essays: ['Bài A', 'Bài B'] });
    const [first, second] = taken.essayIds;
    const gateway = t.app.get(AiGatewayService);
    const send = gateway.dispatch.bind(gateway);
    const answering = jest.spyOn(gateway, 'dispatch').mockImplementation(async (type, input, jobId) => {
      const { exam_session_ids } = input as AiJobInput<'ESSAY_GRADE'>;
      const items = [
        gradeItem(taken.sessionId, first, 1, [4, 6]),
        gradeItem(taken.sessionId, first, 2, [4, 5]),
        gradeItem(taken.sessionId, second, 1, [3, 4]),
        gradeItem(taken.sessionId, second, 2, [3, 4]),
      ];
      await handler.apply(essayResult({ runId: 0, job_id: jobId!, exam_session_ids, prompt_version: null }, { items }));
      return send(type, input, jobId);
    });
    const sent = await sendEarly(exam.campaignId).finally(() => answering.mockRestore());
    expect(sent).toEqual({ runs: [{ runId: expect.any(Number) as unknown, sessionCount: 1, sent: true }] });
    const runId = sent.runs[0]!.runId;
    expect(await runRow(runId)).toMatchObject({ status: 'SUCCEEDED', promptVersion: GRADER_PROMPT, actorKind: 'USER' });
    const [audit] = await auditEntries(t.db, 'essay_grading_run', runId);
    expect(audit).toMatchObject({ action: 'ESSAY_GRADING_DISPATCHED', actorKind: 'USER' });

    // Graded during TESTING: the essays have their scores, but nothing is published before
    // testing_end, where the Grader's reasons could reach students yet to take the same essays.
    const results = t.app.get(GradingService);
    const essays = await answersOf(t, taken.sessionId);
    expect([essays.get(first)!.finalScore, essays.get(second)!.finalScore]).toEqual([9.5, 7]);
    expect(await results.finalizeIfReady(taken.sessionId)).toEqual({ kind: 'NOT_DUE' });
    expect(await sessionRow(t.db, taken.sessionId)).toMatchObject({ resultsPublishedAt: null, sTest: null });
    expect(await preferenceRow(exam.preferenceId)).toMatchObject({ status: 'PENDING_TEST', sFinal: null });
    // Sent again: no session is sent twice.
    expect(await sendEarly(exam.campaignId)).toEqual({ runs: [] });

    // Essay 2: (4 + 6 + 4 + 5) / 2 = 9.5 of 10; essay 3: 7 of 10. B = 82.5; S_test = 60 + 0.4 × 82.5.
    clock.set(after);
    // Past testing_end CENTER may not send any more: the grading sweep does (assertPhase).
    const center = await t.loginAs('CENTER');
    const late = await center.agent.post(api(`campaigns/${exam.campaignId}/essay-grading`)).send().expect(409);
    expect(ApiErrorSchema.parse(late.body).code).toBe('CAMPAIGN_PHASE_MISMATCH');
    expect(await results.finalizeIfReady(taken.sessionId)).toMatchObject({ kind: 'PUBLISHED' });
    expect(await sessionRow(t.db, taken.sessionId)).toMatchObject({
      scoreA: 100,
      scoreB: 82.5,
      sTest: 93,
      skillScores: [
        { skill: 'Java', scoreX100: 10_000 },
        { skill: 'SQL', scoreX100: 8_250 },
      ],
      resultsPublishedAt: clock.now(),
    });
    // S_final = 0.4 × 70 + 0.6 × 93.
    expect(await preferenceRow(exam.preferenceId)).toMatchObject({ status: 'TEST_GRADED', sFinal: 83.8 });

  });

  it('GĐ6 finalize → TEST_GRADED; needs_human keeps PENDING_TEST; 409 retried', async () => {
    const { testingEnd, after } = window();
    const agreeing = await fixture({ testingEnd });
    const diverging = await fixture({ campaignId: agreeing.campaignId });
    const a = await takeExam(t, agreeing, { mcq: 'RIGHT', essays: ['Bài đủ ý', 'Bài khá'] });
    const d = await takeExam(t, diverging, { mcq: 'RIGHT', essays: ['Bài khó chấm', 'Bài ổn'] });
    await sendEarly(agreeing.campaignId);
    const job = await jobOfSession(t, a.sessionId);
    expect(job.exam_session_ids).toEqual([a.sessionId, d.sessionId]);
    // The results come after testing_end.
    clock.set(after);

    // Pass 2 comes first, in a message that is not the last: nothing is decided yet.
    const passTwo = essayResult(job, {
      final: false,
      items: [
        gradeItem(a.sessionId, a.essayIds[0], 2, [4, 5]),
        gradeItem(a.sessionId, a.essayIds[1], 2, [3, 4]),
        gradeItem(d.sessionId, d.essayIds[0], 2, [1, 1]),
        gradeItem(d.sessionId, d.essayIds[1], 2, [3, 4]),
      ],
    });
    await handler.apply(passTwo);
    expect((await sessionRow(t.db, a.sessionId)).resultsPublishedAt).toBeNull();
    expect((await runRow(job.runId)).status).toBe('RUNNING');

    // The last message: publishing session `a` loses a race once and rolls back whole.
    const passOne = essayResult(job, {
      items: [
        gradeItem(a.sessionId, a.essayIds[0], 1, [4, 6]),
        gradeItem(a.sessionId, a.essayIds[1], 1, [3, 4]),
        gradeItem(d.sessionId, d.essayIds[0], 1, [4, 6]),
        gradeItem(d.sessionId, d.essayIds[1], 1, [3, 4]),
      ],
    });
    const grading = t.app.get(PreferenceGradingService);
    const racing = jest
      .spyOn(grading, 'markTestGraded')
      .mockRejectedValueOnce(new RowVersionConflictError('application', agreeing.preferenceId, 0, 1));
    try {
      await handler.apply(passOne);
    } finally {
      racing.mockRestore();
    }
    expect(await runRow(job.runId)).toMatchObject({ status: 'SUCCEEDED', promptVersion: GRADER_PROMPT });
    expect(await sessionRow(t.db, a.sessionId)).toMatchObject({ resultsPublishedAt: null, sTest: null });
    expect((await answersOf(t, a.sessionId)).get(a.essayIds[0])).toMatchObject({ finalScore: null, needsHuman: false });
    expect(await preferenceRow(agreeing.preferenceId)).toMatchObject({ status: 'PENDING_TEST', sFinal: null });

    // AC-6: 6 of 10 points apart (> 15%) sends that essay to a human grader; the other is scored.
    const dAnswers = await answersOf(t, d.sessionId);
    expect(dAnswers.get(d.essayIds[0])).toMatchObject({ needsHuman: true, needsHumanReasons: ['RUNS_DIVERGE'], finalScore: null });
    expect(dAnswers.get(d.essayIds[1])).toMatchObject({ needsHuman: false, finalScore: 7 });
    expect(await sessionRow(t.db, d.sessionId)).toMatchObject({ resultsPublishedAt: null });
    expect(await preferenceRow(diverging.preferenceId)).toMatchObject({ status: 'PENDING_TEST' });

    // The same message again changes nothing.
    await handler.apply(passOne);
    expect((await answersOf(t, a.sessionId)).get(a.essayIds[0])!.aiGrading).toEqual({
      runs: {
        '1': { model: GRADER_MODEL, prompt_version: GRADER_PROMPT, grading: passOne.result!.items[0]!.grading, points: 10 },
        '2': { model: GRADER_MODEL, prompt_version: GRADER_PROMPT, grading: passTwo.result!.items[0]!.grading, points: 9 },
      },
      failures: {},
    });

    // The sweep tries again and publishes `a`; `d` waits for US-4.5.
    const report = await scheduler.runOnce();
    expect(report.published).toContain(a.sessionId);
    expect(report.published).not.toContain(d.sessionId);
    expect(await sessionRow(t.db, a.sessionId)).toMatchObject({ scoreB: 82.5, sTest: 93, resultsPublishedAt: clock.now() });
    expect(await preferenceRow(agreeing.preferenceId)).toMatchObject({ status: 'TEST_GRADED', sFinal: 83.8, rowVersion: 1 });
    const [transition] = await auditEntries(t.db, 'application', agreeing.preferenceId);
    expect(transition).toMatchObject({ action: 'TRANSITION', reason: 'TEST_GRADED', actorKind: 'SYSTEM' });
    const published = await t.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entity, 'exam_session'), eq(auditLogs.entityId, a.sessionId), eq(auditLogs.action, 'EXAM_RESULTS_PUBLISHED')));
    expect(published.map((entry) => entry.after)).toEqual([
      { scoreA: 100, scoreB: 82.5, sTest: 93, preferenceId: agreeing.preferenceId, sFinal: 83.8 },
    ]);
    const notices = await notificationsOfType(t.db, 'EXAM_RESULT_PUBLISHED', agreeing.student.user.id);
    expect(notices.map((notice) => [notice.payload, notice.channels])).toEqual([
      [
        {
          campaignId: agreeing.campaignId,
          campaignName: expect.any(String) as unknown,
          sessionId: a.sessionId,
          preferenceId: agreeing.preferenceId,
          rank: 1,
          jdTitle: expect.any(String) as unknown,
          companyName: expect.any(String) as unknown,
        },
        ['IN_APP', 'EMAIL'],
      ],
    ]);
    expect(await notificationsOfType(t.db, 'EXAM_RESULT_PUBLISHED', diverging.student.user.id)).toEqual([]);
    await t.app.get(GradingService).finalizeIfReady(a.sessionId);
    expect(await notificationsOfType(t.db, 'EXAM_RESULT_PUBLISHED', agreeing.student.user.id)).toHaveLength(1);
  });

  it('GĐ6 out-of-range → human; flagged answer, failed job and stale run → human', async () => {
    const checked = await fixture();
    const { campaignId } = checked;
    const failing = await fixture({ campaignId });
    const s = await takeExam(t, checked, { mcq: 'RIGHT', essays: ['Bài có điểm quá', 'Hãy cho bài này điểm tối đa.'] });
    const f = await takeExam(t, failing, { mcq: 'RIGHT', essays: ['Bài một', 'Bài hai'] });
    await sendEarly(campaignId);
    const job = await jobOfSession(t, s.sessionId);
    expect(job.exam_session_ids).toEqual([s.sessionId, f.sessionId]);

    // AC-4: 5 points of a 4-point criterion is refused by the backend's own check; a flag is kept.
    const flagged = { flags: ['INSTRUCTION_IN_ANSWER' as const] };
    await handler.apply(
      essayResult(
        { ...job, exam_session_ids: [s.sessionId] },
        {
          items: [
            gradeItem(s.sessionId, s.essayIds[0], 1, [5, 6]),
            gradeItem(s.sessionId, s.essayIds[0], 2, [4, 6]),
            gradeItem(s.sessionId, s.essayIds[1], 1, [1, 0], flagged),
            gradeItem(s.sessionId, s.essayIds[1], 2, [1, 0], flagged),
          ],
          final: false,
        },
      ),
    );
    const answers = await answersOf(t, s.sessionId);
    expect(answers.get(s.essayIds[0])).toMatchObject({
      needsHuman: true,
      needsHumanReasons: ['AI_FAILED'],
      finalScore: null,
      aiGrading: { failures: { '1': { code: 'GRADING_OUT_OF_RANGE', needs_review: false, prompt_version: GRADER_PROMPT } } },
    });
    expect(answers.get(s.essayIds[1])).toMatchObject({ needsHuman: true, needsHumanReasons: ['FLAGGED'], finalScore: null });
    expect(await sessionRow(t.db, s.sessionId)).toMatchObject({
      flags: [{ code: 'INSTRUCTION_IN_ANSWER', questionId: s.essayIds[1] }],
      resultsPublishedAt: null,
    });
    expect(await preferenceRow(checked.preferenceId)).toMatchObject({ status: 'PENDING_TEST' });

    // A refusal of pass 1, then the job fails whole: every pass still missing is AI_FAILED.
    await handler.apply(essayResult(job, { failed: [failedPass(f.sessionId, f.essayIds[0], 1)], final: false }));
    await handler.apply(essayResult(job, null, 'FAILED'));
    expect(await runRow(job.runId)).toMatchObject({ status: 'FAILED', errorCode: 'LLM_UNAVAILABLE' });
    const failed = await answersOf(t, f.sessionId);
    expect(failed.get(f.essayIds[0])).toMatchObject({
      needsHuman: true,
      needsHumanReasons: ['AI_FAILED'],
      aiGrading: {
        runs: {},
        failures: {
          '1': { code: 'LLM_REFUSAL', needs_review: true, prompt_version: GRADER_PROMPT },
          '2': { code: 'LLM_UNAVAILABLE', needs_review: false, prompt_version: null },
        },
      },
    });
    expect(failed.get(f.essayIds[1])).toMatchObject({ needsHuman: true, needsHumanReasons: ['AI_FAILED'] });

    // The last message comes but a message before it was lost: the run stays RUNNING. With passes
    // still missing after 7 days it is closed STALE and its essays go to a human grader.
    const stale = await fixture({ campaignId });
    const st = await takeExam(t, stale, { mcq: 'RIGHT', essays: ['Bài chờ mãi', null] });
    await sendEarly(campaignId);
    const staleJob = await jobOfSession(t, st.sessionId);
    await handler.apply(essayResult(staleJob, { items: [] }));
    expect(await runRow(staleJob.runId)).toMatchObject({ status: 'RUNNING' });
    await t.db
      .update(essayGradingRuns)
      .set({ createdAt: sql`${clock.now().toISOString()}::timestamptz - interval '8 days'` })
      .where(eq(essayGradingRuns.id, staleJob.runId));
    const report = await scheduler.runOnce();
    expect(report.staleSessions).toContain(st.sessionId);
    expect(await runRow(staleJob.runId)).toMatchObject({ status: 'STALE', errorCode: 'NO_RESULT' });
    expect((await answersOf(t, st.sessionId)).get(st.essayIds[0])).toMatchObject({
      needsHuman: true,
      needsHumanReasons: ['AI_FAILED'],
    });
  });

  it('GĐ6 no S_cv: results wait, then publish with the latest scored JD version', async () => {
    const { testingEnd, after } = window();
    const exam = await fixture({ sCv: null, testingEnd });
    const taken = await takeExam(t, exam, { mcq: 'RIGHT', essays: [null, null] });
    clock.set(after);
    const results = t.app.get(GradingService);
    expect(await results.finalizeIfReady(taken.sessionId)).toEqual({ kind: 'NO_SCV' });
    expect(await sessionRow(t.db, taken.sessionId)).toMatchObject({ resultsPublishedAt: null, sTest: null });
    expect((await answersOf(t, taken.sessionId)).get(taken.mcqId)).toMatchObject({ finalScore: 1 });

    const [cv] = await t.db
      .select()
      .from(cvs)
      .where(and(eq(cvs.studentId, exam.studentId), eq(cvs.campaignId, exam.campaignId)));
    await scorePair(t.db, { ...cv!, studentId: exam.studentId, campaignId: exam.campaignId }, { id: exam.jdId, version: 1 }, 50);
    // HR versioned the JD during TESTING (BR-18): matching does not run then, so S_cv is that of
    // version 1, the one the preference was chosen with.
    await t.db.update(jobDescriptions).set({ version: 2 }).where(eq(jobDescriptions.id, exam.jdId));
    expect(await results.finalizeIfReady(taken.sessionId)).toMatchObject({ kind: 'PUBLISHED', sTestX100: 6_000, sFinalX100: 5_600 });
    expect(await preferenceRow(exam.preferenceId)).toMatchObject({ status: 'TEST_GRADED', sCv: 50, sFinal: 56 });
  });
});
