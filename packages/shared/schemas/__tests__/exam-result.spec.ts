import { EXAM_GRADING_REASONS, ExamResultSchema } from '../exam-result.js';

const scores = {
  publishedAt: '2026-11-12T03:00:00.000Z',
  sTest: 72.5,
  partA: 80,
  partB: 61.25,
  skills: [
    { skill: 'SQL', score: 72.5 },
    { skill: 'Git', score: null },
  ],
  preference: { preferenceId: 8, rank: 2, sCv: 64.1, sFinal: 69.54, status: 'TEST_GRADED' },
  essays: [
    {
      questionId: 40,
      no: 11,
      stem: 'Khi nào nên tạo chỉ mục?',
      points: 3.5,
      maxPoints: 5,
      criteria: [{ no: 1, points: 3.5, maxPoints: 5, reason: 'Nêu đúng khái niệm, thiếu ví dụ.' }],
    },
  ],
};

const base = {
  sessionId: 31,
  jdTitle: 'Backend Intern',
  companyName: 'Công ty A',
  submittedAt: '2026-11-10T03:00:00.000Z',
};

const published = { state: 'PUBLISHED', ...base, scores };

describe('US-4.4 AC-12: the result a student sees is a whitelist (Invariant 8)', () => {
  it('GĐ6 keeps the scores and drops an answer key, a rubric or a sample answer', () => {
    const leaked = {
      ...published,
      answerKey: { correct_option: 2 },
      scores: {
        ...scores,
        essays: [{ ...scores.essays[0], rubric: [{ criterion: 'Nêu khái niệm', max_points: 5 }], sampleAnswer: 'x' }],
      },
    };
    const parsed = ExamResultSchema.parse(leaked);
    expect(parsed).toEqual(published);
    expect(JSON.stringify(parsed)).not.toMatch(/answerKey|rubric|sampleAnswer|correct_option/);
  });

  it('GĐ6 a session still being graded shows no score', () => {
    expect(ExamResultSchema.parse({ state: 'GRADING', ...base, scores: null })).toEqual({
      state: 'GRADING',
      ...base,
      scores: null,
    });
    expect(ExamResultSchema.safeParse({ ...published, state: 'GRADING' }).success).toBe(false);
    expect(ExamResultSchema.safeParse({ ...published, scores: null }).success).toBe(false);
  });

  it('GĐ6 scores stay on the 0–100 scale', () => {
    expect(ExamResultSchema.safeParse({ ...published, scores: { ...scores, sTest: 100.01 } }).success).toBe(false);
  });

  it('GĐ6 a session whose preference is gone still shows its scores', () => {
    const parsed = ExamResultSchema.parse({ ...published, scores: { ...scores, preference: null } });
    expect(parsed.scores?.preference).toBeNull();
  });
});

describe('US-4.4 AC-6: handoff reasons', () => {
  it('GĐ6 lists the five reasons of D53', () => {
    expect(EXAM_GRADING_REASONS).toEqual(['RUNS_DIVERGE', 'LOW_CONFIDENCE', 'FLAGGED', 'AI_FAILED', 'NEAR_THRESHOLD']);
  });
});
