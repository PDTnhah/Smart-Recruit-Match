// US-4.4 AC-12 (FR-22, BR-11, AGENTS › Invariants 7, 8, CONTEXT D53): a student reads the results of
// their own closed session, GRADING until published, then the scores, the preference's S_cv and
// S_final, and each essay's points with the Grader's reasons by criterion number. The response is a
// whitelist: no answer key, rubric words or sample answer. The clock is a FakeClock near the real
// time; the grading sweep is grading.int-spec.ts's.
import type { TestingModuleBuilder } from '@nestjs/testing';
import { ApiErrorSchema, ExamResultSchema, MyExamsResponseSchema } from '@srm/shared';
import { Clock } from '../../src/common/clock/index.js';
import { EssayResultsHandler, GradingService } from '../../src/modules/assessment/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { minutesAfter, sessionRow } from '../helpers/exam.js';
import { FakeClock } from '../helpers/fake-clock.js';
import { createGradingFixture, essayResult, gradeItem, jobOfSession, takeExam } from '../helpers/grading.js';

/** Keys that would give away the answer key, the rubric or the original place of an option. */
const FORBIDDEN_KEYS = [
  'answerKey',
  'answer_key',
  'correct_option',
  'correctOption',
  'explanation',
  'rubric',
  'criterion',
  'sample_answer',
  'sampleAnswer',
  'aiGrading',
  'ai_grading',
  'option',
  'optionLayout',
];

function keysOf(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) keysOf(item, into);
  else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      into.add(key);
      keysOf(item, into);
    }
  }
  return into;
}

describe('GĐ6 exam results (US-4.4)', () => {
  const clock = new FakeClock();
  let t: AuthTestApp;

  beforeAll(async () => {
    t = await createAuthTestApp({ configure: (b: TestingModuleBuilder) => b.overrideProvider(Clock).useValue(clock) });
  });

  beforeEach(() => clock.set(new Date()));

  afterAll(() => t.close());

  const result = (as: LoggedIn, sessionId: number) => as.agent.get(api(`exam-sessions/${sessionId}/result`));

  it('GĐ6 owner only, no answer_key or rubric', async () => {
    const testingEnd = minutesAfter(clock.now(), 24 * 60);
    const exam = await createGradingFixture(t, { now: clock.now(), testingEnd });
    const taken = await takeExam(t, exam, { mcq: 'RIGHT', essays: ['Bài làm câu tự luận', null] }, { submit: false });
    const { sessionId } = taken;

    // Still open: no result yet.
    expect(ApiErrorSchema.parse((await result(exam.student, sessionId).expect(409)).body).code).toBe('EXAM_NOT_CLOSED');

    await exam.student.agent.post(api(`exam-sessions/${sessionId}/submit`)).send().expect(200);
    const submittedAt = clock.now().toISOString();
    expect(ExamResultSchema.parse((await result(exam.student, sessionId).expect(200)).body)).toEqual({
      state: 'GRADING',
      sessionId,
      jdTitle: 'Backend Intern',
      companyName: expect.any(String) as unknown,
      submittedAt,
      scores: null,
    });

    // The Grader's two passes come back; the results are published after testing_end.
    const center = await t.loginAs('CENTER');
    await center.agent.post(api(`campaigns/${exam.campaignId}/essay-grading`)).send().expect(200);
    const [essay, blank] = taken.essayIds;
    await t.app.get(EssayResultsHandler).apply(
      essayResult(await jobOfSession(t, sessionId), {
        items: [gradeItem(sessionId, essay, 1, [3, 5]), gradeItem(sessionId, essay, 2, [3, 4])],
      }),
    );
    expect(ExamResultSchema.parse((await result(exam.student, sessionId).expect(200)).body)).toMatchObject({ state: 'GRADING' });
    clock.set(new Date(Date.parse(testingEnd) + 60_000));
    expect(await t.app.get(GradingService).finalizeIfReady(sessionId)).toMatchObject({ kind: 'PUBLISHED' });

    const body = (await result(exam.student, sessionId).expect(200)).body as unknown;
    const published = ExamResultSchema.parse(body);
    const paper = (await sessionRow(t.db, sessionId)).questionIds;
    // Essay: 7.5 of 10 (r = 0.75); the blank one 0. B = 37.5; S_test = 0.6 × 100 + 0.4 × 37.5 = 75.
    expect(published).toEqual({
      state: 'PUBLISHED',
      sessionId,
      jdTitle: 'Backend Intern',
      companyName: expect.any(String) as unknown,
      submittedAt,
      scores: {
        publishedAt: expect.any(String) as unknown,
        sTest: 75,
        partA: 100,
        partB: 37.5,
        skills: [
          { skill: 'Java', score: 100 },
          { skill: 'SQL', score: 37.5 },
        ],
        // S_final = 0.4 × 70 + 0.6 × 75.
        preference: { preferenceId: exam.preferenceId, rank: 1, sCv: 70, sFinal: 73, status: 'TEST_GRADED' },
        essays: [
          {
            questionId: essay,
            no: paper.indexOf(essay) + 1,
            stem: expect.any(String) as unknown,
            points: 7.5,
            maxPoints: 10,
            criteria: [
              { no: 1, points: 3, maxPoints: 4, reason: 'Tiêu chí 1: 3 điểm.' },
              { no: 2, points: 4.5, maxPoints: 6, reason: 'Tiêu chí 2: 5 điểm.' },
            ],
          },
          { questionId: blank, no: paper.indexOf(blank) + 1, stem: expect.any(String) as unknown, points: 0, maxPoints: 10, criteria: [] },
        ].sort((a, b) => a.no - b.no),
      },
    });
    // The raw body, not only what the schema keeps: nothing of the answer key or the rubric.
    const keys = keysOf(body);
    expect(FORBIDDEN_KEYS.filter((key) => keys.has(key))).toEqual([]);
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/Nêu đúng khái niệm|Có ví dụ|Đáp án mẫu|Phương án B đúng vì|Đánh giá khả năng thiết kế/);

    const exams = MyExamsResponseSchema.parse((await exam.student.agent.get(api('me/exams')).expect(200)).body);
    expect(exams.items.find((item) => item.preferenceId === exam.preferenceId)).toMatchObject({
      sessionId,
      resultState: 'PUBLISHED',
    });

    // Another student's session reads as missing (BR-11); other roles may not read results.
    const intruder = await t.loginAs('STUDENT');
    await result(intruder, sessionId).expect(404);
    // A session that does not exist reads the same: the 404 tells nothing about other students.
    expect(ApiErrorSchema.parse((await result(intruder, sessionId + 1_000_000).expect(404)).body).code).toBe(
      ApiErrorSchema.parse((await result(intruder, sessionId).expect(404)).body).code,
    );
    await result(center, sessionId).expect(403);
    await result(await t.loginAs('HR'), sessionId).expect(403);
  });
});
