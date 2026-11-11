// US-4.5 AC-1–AC-5, AC-7 (FR-23, BR-03, BR-13, AD-2, AD-8, CONTEXT D53, D54, LESSONS §12, §22, §34):
// the queue of essays the Grader handed over, the anonymous grading pane, the grade per rubric
// criterion added by code with its audit entry, the optimistic lock, and the publication through
// `finalizeIfReady` once the last answer of a session is graded. Its clock is in March 2002, away
// from every other file's campaigns (test/helpers/fake-clock.ts); it never calls a sweep's runOnce().
import type { TestingModuleBuilder } from '@nestjs/testing';
import { ApiErrorSchema, type GradingResult, ManualGradeResultSchema } from '@srm/shared';
import { eq } from 'drizzle-orm';
import { Clock } from '../../src/common/clock/index.js';
import { RowVersionConflictError } from '../../src/common/errors/index.js';
import { essayGradingRuns, preferences, students } from '../../src/db/schema/index.js';
import { AiGatewayService } from '../../src/modules/aigateway/index.js';
import { EssayResultsHandler, GradingService } from '../../src/modules/assessment/index.js';
import { ManualGradingRepository } from '../../src/modules/assessment/infrastructure/manual-grading.repository.js';
import { PreferenceGradingService } from '../../src/modules/matching/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import type { ExamFixture } from '../helpers/exam.js';
import { minutesAfter, sessionRow } from '../helpers/exam.js';
import { FakeClock } from '../helpers/fake-clock.js';
import {
  answersOf,
  createGradingFixture,
  essayResult,
  gradeItem,
  type GradingFixtureOptions,
  jobOfSession,
  type TakenExam,
  takeExam,
} from '../helpers/grading.js';
import { notificationsOfType } from '../helpers/notifications.js';
import { auditEntries } from '../helpers/state.js';

const START = '2002-03-04T08:00:00.000Z';

/** One pass over an essay of the test bank (criteria worth 4 and 6 points). */
type Pass = [number, number] | { points: [number, number]; extra: Partial<GradingResult> };

/** 10 and 2 of 10 points: more than 15% apart, so RUNS_DIVERGE. */
const DIVERGE: [Pass, Pass] = [
  [4, 6],
  [1, 1],
];
/** 7 of 10 twice: the Grader's score stands. */
const AGREE: [Pass, Pass] = [
  [3, 4],
  [3, 4],
];
const LOW: [Pass, Pass] = [[3, 4], { points: [3, 4], extra: { confidence: 'LOW' } }];
const FLAG: [Pass, Pass] = [[3, 4], { points: [3, 4], extra: { flags: ['INSTRUCTION_IN_ANSWER'] } }];
/** 9 of 10 twice: with the MCQ wrong, S_test 36 is within 5 points of θ_test 40. */
const NEAR: [Pass, Pass] = [
  [4, 5],
  [4, 5],
];

/** Every key of a JSON value, at any depth. */
function keysOf(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => keysOf(item, keys));
  else if (value !== null && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      keys.add(key);
      keysOf(inner, keys);
    }
  }
  return keys;
}

function issuePaths(body: unknown): string[] {
  const details = ApiErrorSchema.parse(body).details as { issues: { path: string }[] };
  return details.issues.map((issue) => issue.path);
}

// BR-03: what the grader may see. Nothing of the student.
const QUEUE_KEYS = [
  'items',
  'totalSessions',
  'totalAnswers',
  'sessionId',
  'jdTitle',
  'companyName',
  'submittedAt',
  'answers',
  'answerId',
  'questionNo',
  'skill',
  'maxPoints',
  'reasons',
];
const DETAIL_KEYS = [
  'answerId',
  'sessionId',
  'rowVersion',
  'jdTitle',
  'companyName',
  'questionNo',
  'skill',
  'stem',
  'rubric',
  'criterion',
  'maxPoints',
  'sampleAnswer',
  'answerText',
  'reasons',
  'aiPasses',
  'passNo',
  'points',
  'confidence',
  'flags',
  'criteria',
  'index',
  'reason',
  'failureCode',
  'manualGrade',
  'note',
  'finalScore',
  'gradedAt',
];

describe('GĐ6 manual grading (US-4.5)', () => {
  const clock = new FakeClock(START);
  let t: AuthTestApp;
  let handler: EssayResultsHandler;
  let center: LoggedIn;

  beforeAll(async () => {
    t = await createAuthTestApp({ configure: (b: TestingModuleBuilder) => b.overrideProvider(Clock).useValue(clock) });
    handler = t.app.get(EssayResultsHandler);
    center = await t.loginAs('CENTER');
  });

  beforeEach(() => clock.set(START));

  afterAll(() => t.close());

  const fixture = (options: Partial<GradingFixtureOptions> = {}) => createGradingFixture(t, { now: clock.now(), ...options });
  /** A campaign whose test window ends a day after the clock, and the moment just past it. */
  const window = () => {
    const testingEnd = minutesAfter(clock.now(), 24 * 60);
    return { testingEnd, after: new Date(Date.parse(testingEnd) + 60_000) };
  };
  const preferenceRow = async (id: number) => {
    const [row] = await t.db.select().from(preferences).where(eq(preferences.id, id));
    return row!;
  };

  /**
   * CENTER sends the campaign's closed sessions to the Grader, and both passes of every essay come
   * back in one message: each essay is scored or handed over to a human grader.
   */
  const handOver = async (campaignId: number, sessions: { taken: TakenExam; passes: [[Pass, Pass], [Pass, Pass]] }[]) => {
    await center.agent.post(api(`campaigns/${campaignId}/essay-grading`)).send().expect(200);
    const job = await jobOfSession(t, sessions[0]!.taken.sessionId);
    const items = sessions.flatMap(({ taken, passes }) =>
      taken.essayIds.flatMap((questionId, essay) =>
        passes[essay]!.map((pass, i) => {
          const passNo = (i + 1) as 1 | 2;
          return Array.isArray(pass)
            ? gradeItem(taken.sessionId, questionId, passNo, pass)
            : gradeItem(taken.sessionId, questionId, passNo, pass.points, pass.extra);
        }),
      ),
    );
    await handler.apply(essayResult(job, { items }));
  };

  /** `exam_answers.id` of the session's two essays, in paper order. */
  const essayAnswerIds = async (taken: TakenExam): Promise<[number, number]> => {
    const answers = await answersOf(t, taken.sessionId);
    return [answers.get(taken.essayIds[0])!.id, answers.get(taken.essayIds[1])!.id];
  };
  /** `exam_answers.row_version` of the session's two essays: every write of the Grader took one (AD-8). */
  const essayVersions = async (taken: TakenExam): Promise<[number, number]> => {
    const answers = await answersOf(t, taken.sessionId);
    return [answers.get(taken.essayIds[0])!.rowVersion, answers.get(taken.essayIds[1])!.rowVersion];
  };
  const questionNo = async (taken: TakenExam, questionId: number) =>
    (await sessionRow(t.db, taken.sessionId)).questionIds.indexOf(questionId) + 1;
  const grade = (answerId: number, rowVersion: number, points: [number, number], as: LoggedIn = center) =>
    as.agent.put(api(`exam-answers/${answerId}/manual-grade`)).send({
      rowVersion,
      criteria: points.map((p, index) => ({ index, points: p })),
    });

  it('GĐ6 CENTER sees needs_human queue with reasons; HR/STUDENT 403', async () => {
    const { testingEnd } = window();
    const first = await fixture({ testingEnd });
    const { campaignId } = first;
    const second = await fixture({ campaignId });
    const settled = await fixture({ campaignId });
    const a = await takeExam(t, first, { mcq: 'RIGHT', essays: ['Bài 1', 'Bài 2'] });
    const b = await takeExam(t, second, { mcq: 'RIGHT', essays: ['Bài 3', 'Bài 4'] });
    const c = await takeExam(t, settled, { mcq: 'RIGHT', essays: ['Bài 5', 'Bài 6'] });
    await handOver(campaignId, [
      { taken: a, passes: [DIVERGE, FLAG] },
      { taken: b, passes: [AGREE, LOW] },
      { taken: c, passes: [AGREE, AGREE] },
    ]);
    const [a0, a1] = await essayAnswerIds(a);
    const [, b1] = await essayAnswerIds(b);
    const entry = async (taken: TakenExam, answers: { answerId: number; questionId: number; reasons: string[] }[]) => ({
      sessionId: taken.sessionId,
      jdTitle: 'Backend Intern',
      companyName: expect.any(String) as unknown,
      submittedAt: (await sessionRow(t.db, taken.sessionId)).submittedAt!.toISOString(),
      answers: await Promise.all(
        answers.map(async ({ answerId, questionId, reasons }) => ({
          answerId,
          questionNo: await questionNo(taken, questionId),
          skill: 'SQL',
          maxPoints: 10,
          reasons,
        })),
      ),
    });
    const sessionA = await entry(a, [
      { answerId: a0, questionId: a.essayIds[0], reasons: ['RUNS_DIVERGE'] },
      { answerId: a1, questionId: a.essayIds[1], reasons: ['FLAGGED'] },
    ]);
    const sessionB = await entry(b, [{ answerId: b1, questionId: b.essayIds[1], reasons: ['LOW_CONFIDENCE'] }]);
    const queue = (query = '') => center.agent.get(api(`campaigns/${campaignId}/grading-queue${query}`));

    // Grouped by session, oldest first; the session the Grader settled is not there.
    expect((await queue().expect(200)).body).toEqual({ items: [sessionA, sessionB], totalSessions: 2, totalAnswers: 3 });
    // Filtered by reason; paged by session.
    expect((await queue('?reason=LOW_CONFIDENCE').expect(200)).body).toEqual({
      items: [sessionB],
      totalSessions: 1,
      totalAnswers: 1,
    });
    expect((await queue('?limit=1').expect(200)).body).toEqual({ items: [sessionA], totalSessions: 2, totalAnswers: 3 });
    expect((await queue('?limit=1&offset=1').expect(200)).body).toEqual({ items: [sessionB], totalSessions: 2, totalAnswers: 3 });
    expect(issuePaths((await queue('?reason=OTHER').expect(400)).body)).toEqual(['reason']);

    // A campaign that does not exist; roles other than CENTER.
    expect(ApiErrorSchema.parse((await center.agent.get(api('campaigns/999999999/grading-queue')).expect(404)).body).code).toBe(
      'ENTITY_NOT_FOUND',
    );
    const hr = await t.loginAs('HR');
    const admin = await t.loginAs('ADMIN');
    for (const agent of [hr.agent, admin.agent, first.student.agent]) {
      await agent.get(api(`campaigns/${campaignId}/grading-queue`)).expect(403);
      await agent.get(api(`exam-answers/${a0}/manual-grading`)).expect(403);
      await agent
        .put(api(`exam-answers/${a0}/manual-grade`))
        .send({ rowVersion: 0, criteria: [{ index: 0, points: 1 }, { index: 1, points: 1 }] })
        .expect(403);
    }
    // Without a session at all.
    await t.http().get(api(`campaigns/${campaignId}/grading-queue`)).expect(401);
    await t.http().get(api(`exam-answers/${a0}/manual-grading`)).expect(401);
    await t.http().put(api(`exam-answers/${a0}/manual-grade`)).send({}).expect(401);
    expect((await answersOf(t, a.sessionId)).get(a.essayIds[0])).toMatchObject({ finalScore: null, manualGrading: null, gradedBy: null });
  });

  it('BR-03 queue and detail responses contain no identity or profile fields', async () => {
    const exam: ExamFixture = await fixture({ testingEnd: window().testingEnd });
    const taken = await takeExam(t, exam, { mcq: 'RIGHT', essays: ['Bài làm cần chấm', 'Bài làm ổn'] });
    await handOver(exam.campaignId, [{ taken, passes: [DIVERGE, AGREE] }]);
    const [essayId, settledId] = await essayAnswerIds(taken);
    const [version] = await essayVersions(taken);
    expect(version).toBeGreaterThan(0);
    const mcqId = (await answersOf(t, taken.sessionId)).get(taken.mcqId)!.id;

    const queue = await center.agent.get(api(`campaigns/${exam.campaignId}/grading-queue`)).expect(200);
    const detail = await center.agent.get(api(`exam-answers/${essayId}/manual-grading`)).expect(200);
    expect([...keysOf(queue.body)].filter((key) => !QUEUE_KEYS.includes(key))).toEqual([]);
    expect([...keysOf(detail.body)].filter((key) => !DETAIL_KEYS.includes(key))).toEqual([]);
    const [student] = await t.db.select().from(students).where(eq(students.id, exam.studentId));
    for (const body of [queue.body, detail.body]) {
      const text = JSON.stringify(body);
      expect(text).not.toContain(student!.studentCode);
      expect(text).not.toContain(student!.fullName);
      expect(text).not.toContain(exam.student.user.email);
    }

    // AC-2: what the grader needs, both passes of the Grader included (CONTEXT D54).
    expect(detail.body).toEqual({
      answerId: essayId,
      sessionId: taken.sessionId,
      rowVersion: version,
      jdTitle: 'Backend Intern',
      companyName: expect.any(String) as unknown,
      questionNo: await questionNo(taken, taken.essayIds[0]),
      skill: 'SQL',
      stem: expect.any(String) as unknown,
      rubric: [
        { criterion: 'Nêu đúng khái niệm', maxPoints: 4 },
        { criterion: 'Có ví dụ', maxPoints: 6 },
      ],
      maxPoints: 10,
      sampleAnswer: expect.stringMatching(/\S/) as unknown,
      answerText: 'Bài làm cần chấm',
      reasons: ['RUNS_DIVERGE'],
      aiPasses: [
        {
          passNo: 1,
          points: 10,
          confidence: 'HIGH',
          flags: [],
          criteria: [
            { index: 0, points: 4, reason: 'Tiêu chí 1: 4 điểm.' },
            { index: 1, points: 6, reason: 'Tiêu chí 2: 6 điểm.' },
          ],
          failureCode: null,
        },
        {
          passNo: 2,
          points: 2,
          confidence: 'HIGH',
          flags: [],
          criteria: [
            { index: 0, points: 1, reason: 'Tiêu chí 1: 1 điểm.' },
            { index: 1, points: 1, reason: 'Tiêu chí 2: 1 điểm.' },
          ],
          failureCode: null,
        },
      ],
      manualGrade: null,
    });

    // Not part of manual grading: a multiple-choice answer, an essay the Grader settled, no answer.
    for (const id of [mcqId, settledId, 999_999_999]) {
      await center.agent.get(api(`exam-answers/${id}/manual-grading`)).expect(404);
      await grade(id, 0, [1, 1]).expect(404);
    }
    expect((await answersOf(t, taken.sessionId)).get(taken.essayIds[1])).toMatchObject({ finalScore: 7, manualGrading: null });
  });

  it('GĐ6 manual criterion scores summed by code with audit; 400 out of range or missing criterion', async () => {
    const exam = await fixture({ testingEnd: window().testingEnd });
    const taken = await takeExam(t, exam, { mcq: 'RIGHT', essays: ['Bài làm lệch điểm', 'Bài làm ổn'] });
    await handOver(exam.campaignId, [{ taken, passes: [DIVERGE, AGREE] }]);
    const [answerId] = await essayAnswerIds(taken);
    const [version] = await essayVersions(taken);
    const put = (body: object) => center.agent.put(api(`exam-answers/${answerId}/manual-grade`)).send(body);

    // Against the rubric (4 and 6 points): every error at once, at the criterion.
    let res = await grade(answerId, version, [5, 7]).expect(400);
    expect(issuePaths(res.body)).toEqual(['criteria.0.points', 'criteria.1.points']);
    res = await put({ rowVersion: version, criteria: [{ index: 0, points: 3 }] }).expect(400);
    expect(issuePaths(res.body)).toEqual(['criteria']);
    res = await put({ rowVersion: version, criteria: [0, 1, 2].map((index) => ({ index, points: 1 })) }).expect(400);
    expect(issuePaths(res.body)).toEqual(['criteria']);
    res = await put({ rowVersion: version, criteria: [{ index: 1, points: 1 }, { index: 0, points: 1 }] }).expect(400);
    expect(issuePaths(res.body)).toEqual(['criteria.0.index', 'criteria.1.index']);
    // Whole points only, checked with the body's shape; there is no total to send.
    res = await put({ rowVersion: version, criteria: [{ index: 0, points: 1.5 }, { index: 1, points: 1 }] }).expect(400);
    expect(issuePaths(res.body)).toEqual(['criteria.0.points']);
    expect((await answersOf(t, taken.sessionId)).get(taken.essayIds[0])).toMatchObject({
      finalScore: null,
      manualGrading: null,
      rowVersion: version,
    });

    clock.advance({ minutes: 5 });
    // A total, a grader or a time sent along are dropped: code adds the points (AD-2).
    res = await put({
      rowVersion: version,
      criteria: [{ index: 0, points: 3 }, { index: 1, points: 5 }],
      note: '  Thiếu ví dụ  ',
      finalScore: 10,
      gradedBy: exam.student.user.id,
      gradedAt: '2000-01-01T00:00:00.000Z',
    }).expect(200);
    const result = ManualGradeResultSchema.parse(res.body);
    const criteria = [
      { index: 0, points: 3 },
      { index: 1, points: 5 },
    ];
    // Before testing_end nothing is published (CONTEXT D53); the grading sweep does it after.
    expect(result.session).toEqual({ remainingAnswers: 0, publication: 'AFTER_TESTING_END' });
    expect(result.detail).toMatchObject({
      answerId,
      rowVersion: version + 1,
      reasons: ['RUNS_DIVERGE'],
      manualGrade: { criteria, note: 'Thiếu ví dụ', finalScore: 8, gradedAt: clock.now().toISOString() },
    });
    expect((await answersOf(t, taken.sessionId)).get(taken.essayIds[0])).toMatchObject({
      finalScore: 8,
      manualGrading: { criteria, note: 'Thiếu ví dụ' },
      gradedBy: center.user.id,
      gradedAt: clock.now(),
      rowVersion: version + 1,
      needsHuman: true,
      needsHumanReasons: ['RUNS_DIVERGE'],
    });
    const entries = await auditEntries(t.db, 'exam_answer', answerId);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: 'EXAM_ANSWER_GRADED_MANUALLY',
      actorKind: 'USER',
      actorId: center.user.id,
      before: { finalScore: null, rowVersion: version },
      after: { sessionId: taken.sessionId, questionId: taken.essayIds[0], finalScore: 8, criteria, note: 'Thiếu ví dụ', rowVersion: version + 1 },
    });
    expect(await sessionRow(t.db, taken.sessionId)).toMatchObject({ resultsPublishedAt: null, sTest: null });
    expect(await preferenceRow(exam.preferenceId)).toMatchObject({ status: 'PENDING_TEST', sFinal: null });
  });

  it('GĐ6 concurrent manual grade 409 on stale row_version; 409 when already final', async () => {
    const exam = await fixture({ testingEnd: window().testingEnd });
    const taken = await takeExam(t, exam, { mcq: 'RIGHT', essays: ['Bài một', 'Bài hai'] });
    await handOver(exam.campaignId, [{ taken, passes: [DIVERGE, DIVERGE] }]);
    const [first, second] = await essayAnswerIds(taken);
    const [firstVersion, secondVersion] = await essayVersions(taken);
    const other = await t.loginAs('CENTER');

    // Two graders save the same answer at once: the second waits for the row lock, then finds a
    // final score.
    const graders = [center, other];
    const points: [number, number][] = [
      [4, 6],
      [1, 1],
    ];
    const responses = await Promise.all(graders.map((grader, i) => grade(first, firstVersion, points[i]!, grader)));
    expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
    const winner = responses.findIndex((res) => res.status === 200);
    expect(ApiErrorSchema.parse(responses[1 - winner]!.body).code).toBe('EXAM_ANSWER_ALREADY_GRADED');
    expect(ManualGradeResultSchema.parse(responses[winner]!.body).session).toEqual({
      remainingAnswers: 1,
      publication: 'WAITING_OTHER_ANSWERS',
    });
    expect((await answersOf(t, taken.sessionId)).get(taken.essayIds[0])).toMatchObject({
      finalScore: winner === 0 ? 10 : 2,
      gradedBy: graders[winner]!.user.id,
      rowVersion: firstVersion + 1,
    });
    expect(await auditEntries(t.db, 'exam_answer', first)).toHaveLength(1);

    // Graded already, even with the current row version: a change goes through an appeal (US-4.6).
    let res = await grade(first, firstVersion + 1, [0, 0]).expect(409);
    expect(ApiErrorSchema.parse(res.body).code).toBe('EXAM_ANSWER_ALREADY_GRADED');
    // A row version the answer never had.
    res = await grade(second, secondVersion + 3, [2, 2]).expect(409);
    expect(ApiErrorSchema.parse(res.body)).toMatchObject({
      code: 'ROW_VERSION_CONFLICT',
      details: { entity: 'exam_answer', id: second, expectedRowVersion: secondVersion + 3, actualRowVersion: secondVersion },
    });
    expect((await answersOf(t, taken.sessionId)).get(taken.essayIds[1])).toMatchObject({ finalScore: null, rowVersion: secondVersion });

    // The graded answer still opens, with its grade, read only.
    const detail = await center.agent.get(api(`exam-answers/${first}/manual-grading`)).expect(200);
    expect(detail.body).toMatchObject({ rowVersion: firstVersion + 1, manualGrade: { finalScore: winner === 0 ? 10 : 2, note: null } });
  });

  it('GĐ6 last pending answer triggers S_test, S_final and transition to graded', async () => {
    const { testingEnd, after } = window();
    const exam = await fixture({ testingEnd });
    const taken = await takeExam(t, exam, { mcq: 'RIGHT', essays: ['Bài một', 'Bài hai'] });
    await handOver(exam.campaignId, [{ taken, passes: [DIVERGE, DIVERGE] }]);
    const [first, second] = await essayAnswerIds(taken);
    const [firstVersion, secondVersion] = await essayVersions(taken);

    // Another answer of the session still waits: S_test is not computed.
    let res = await grade(first, firstVersion, [4, 6]).expect(200);
    expect(ManualGradeResultSchema.parse(res.body).session).toEqual({ remainingAnswers: 1, publication: 'WAITING_OTHER_ANSWERS' });
    expect(await sessionRow(t.db, taken.sessionId)).toMatchObject({ sTest: null, resultsPublishedAt: null });

    // Past testing_end, the last answer publishes: part B (10 + 5) / 2 × 10 = 75, S_test 0.6 × 100 +
    // 0.4 × 75 = 90, S_final 0.4 × 70 + 0.6 × 90 = 82.
    clock.set(after);
    res = await grade(second, secondVersion, [2, 3]).expect(200);
    expect(ManualGradeResultSchema.parse(res.body).session).toEqual({ remainingAnswers: 0, publication: 'PUBLISHED' });
    expect(await sessionRow(t.db, taken.sessionId)).toMatchObject({
      scoreA: 100,
      scoreB: 75,
      sTest: 90,
      resultsPublishedAt: clock.now(),
    });
    expect(await preferenceRow(exam.preferenceId)).toMatchObject({ status: 'TEST_GRADED', sCv: 70, sFinal: 82 });
    const [transition] = await auditEntries(t.db, 'application', exam.preferenceId);
    expect(transition).toMatchObject({ action: 'TRANSITION', reason: 'TEST_GRADED', actorKind: 'SYSTEM' });
    expect(await notificationsOfType(t.db, 'EXAM_RESULT_PUBLISHED', exam.student.user.id)).toHaveLength(1);

    // The student's page stays as in US-4.4: staff-graded essays show their score, no criteria.
    const page = await exam.student.agent.get(api(`exam-sessions/${taken.sessionId}/result`)).expect(200);
    expect((page.body as { scores: { essays: unknown[] } }).scores.essays).toEqual([
      expect.objectContaining({ questionId: taken.essayIds[0], points: 10, maxPoints: 10, criteria: [] }),
      expect.objectContaining({ questionId: taken.essayIds[1], points: 5, maxPoints: 10, criteria: [] }),
    ]);
  });

  it('GĐ6 NEAR_THRESHOLD answers graded by hand are not handed over again; a failed publication keeps the grade', async () => {
    const { testingEnd, after } = window();
    const exam = await fixture({ testingEnd });
    const taken = await takeExam(t, exam, { mcq: 'WRONG', essays: ['Bài sát ngưỡng một', 'Bài sát ngưỡng hai'] });
    await handOver(exam.campaignId, [{ taken, passes: [NEAR, NEAR] }]);
    const answers = await answersOf(t, taken.sessionId);
    expect(taken.essayIds.map((id) => answers.get(id)!.needsHumanReasons)).toEqual([['NEAR_THRESHOLD'], ['NEAR_THRESHOLD']]);
    const [first, second] = await essayAnswerIds(taken);
    const [firstVersion, secondVersion] = await essayVersions(taken);

    // A failure after the commit, here counting what is left: the grade stays, the API answers 200.
    const counting = jest.spyOn(t.app.get(ManualGradingRepository), 'countWaiting').mockRejectedValueOnce(new Error('pool down'));
    let res;
    try {
      res = await grade(first, firstVersion, [4, 6]).expect(200);
    } finally {
      counting.mockRestore();
    }
    expect(ManualGradeResultSchema.parse(res.body)).toMatchObject({
      detail: { rowVersion: firstVersion + 1, manualGrade: { finalScore: 10 } },
      session: { remainingAnswers: 0, publication: 'NEXT_SWEEP' },
    });
    expect((await answersOf(t, taken.sessionId)).get(taken.essayIds[0])).toMatchObject({ finalScore: 10 });

    // Publishing loses a race: the grade stays, the response says the sweep tries again.
    clock.set(after);
    const racing = jest
      .spyOn(t.app.get(PreferenceGradingService), 'markTestGraded')
      .mockRejectedValueOnce(new RowVersionConflictError('application', exam.preferenceId, 0, 1));
    try {
      res = await grade(second, secondVersion, [4, 6]).expect(200);
    } finally {
      racing.mockRestore();
    }
    expect(ManualGradeResultSchema.parse(res.body).session).toEqual({ remainingAnswers: 0, publication: 'NEXT_SWEEP' });
    expect((await answersOf(t, taken.sessionId)).get(taken.essayIds[1])).toMatchObject({ finalScore: 10, rowVersion: secondVersion + 1 });
    expect(await sessionRow(t.db, taken.sessionId)).toMatchObject({ resultsPublishedAt: null });

    // What the sweep calls: S_test 0.4 × 100 = 40 is still within 5 points of θ_test, yet the
    // graded answers stay graded and the results are published.
    expect(await t.app.get(GradingService).finalizeIfReady(taken.sessionId)).toMatchObject({ kind: 'PUBLISHED', sTestX100: 4000 });
    const graded = await answersOf(t, taken.sessionId);
    expect(taken.essayIds.map((id) => graded.get(id))).toEqual([
      expect.objectContaining({ finalScore: 10, needsHuman: true, needsHumanReasons: ['NEAR_THRESHOLD'] }),
      expect.objectContaining({ finalScore: 10, needsHuman: true, needsHumanReasons: ['NEAR_THRESHOLD'] }),
    ]);
    expect(await preferenceRow(exam.preferenceId)).toMatchObject({ status: 'TEST_GRADED', sFinal: 52 });
  });

  it('BR-13 manual grading publishes no AI job', async () => {
    const { testingEnd, after } = window();
    const exam = await fixture({ testingEnd });
    const taken = await takeExam(t, exam, { mcq: 'RIGHT', essays: ['Bài cần người chấm', 'Bài ổn'] });
    await handOver(exam.campaignId, [{ taken, passes: [DIVERGE, AGREE] }]);
    const [answerId] = await essayAnswerIds(taken);
    const [version] = await essayVersions(taken);
    const runsOfCampaign = () => t.db.select().from(essayGradingRuns).where(eq(essayGradingRuns.campaignId, exam.campaignId));
    const runs = await runsOfCampaign();
    clock.set(after);

    const dispatch = jest.spyOn(t.app.get(AiGatewayService), 'dispatch');
    try {
      await center.agent.get(api(`campaigns/${exam.campaignId}/grading-queue`)).expect(200);
      await center.agent.get(api(`exam-answers/${answerId}/manual-grading`)).expect(200);
      const res = await grade(answerId, version, [3, 3]).expect(200);
      expect(ManualGradeResultSchema.parse(res.body).session.publication).toBe('PUBLISHED');
      expect(dispatch).not.toHaveBeenCalled();
    } finally {
      dispatch.mockRestore();
    }
    expect(await runsOfCampaign()).toEqual(runs);
  });
});
