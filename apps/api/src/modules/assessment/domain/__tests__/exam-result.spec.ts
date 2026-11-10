import { ExamResultEssaySchema, type QuestionRubric, type StoredGradingRun } from '@srm/shared';
import { resultEssayOf, type ResultEssayInput, resultSkillsOf } from '../exam-result.js';

// US-4.4 AC-12 (AGENTS › Invariant 8): what a student sees of a graded essay.

const RUBRIC: QuestionRubric = [
  { criterion: 'Nêu đúng khái niệm (không gửi cho SV)', max_points: 6 },
  { criterion: 'Có ví dụ (không gửi cho SV)', max_points: 4 },
];

const run = (points: [number, number], reasons: [string, string]): StoredGradingRun => ({
  model: 'claude-opus-5-5',
  prompt_version: 'grader/v1',
  grading: {
    criteria: points.map((p, index) => ({ index, points: p, reason: reasons[index]! })),
    confidence: 'HIGH',
    flags: [],
  },
  points: points[0] + points[1],
});

const input = (answer: ResultEssayInput['answer']): ResultEssayInput => ({
  questionId: 12,
  no: 3,
  stem: 'Giải thích interface.',
  rubric: RUBRIC,
  answer,
});

describe('US-4.4 AC-12: a graded essay as the student sees it', () => {
  it('GĐ6 criteria by number: mean points of the two passes, reason of the first, no rubric words', () => {
    const essay = resultEssayOf(
      input({
        finalScore: 8.5,
        needsHuman: false,
        aiGrading: { runs: { '1': run([5, 4], ['Đủ ý.', 'Ví dụ tốt.']), '2': run([5, 3], ['Đúng.', 'Ví dụ ngắn.']) }, failures: {} },
      }),
    );
    expect(essay).toEqual({
      questionId: 12,
      no: 3,
      stem: 'Giải thích interface.',
      points: 8.5,
      maxPoints: 10,
      criteria: [
        { no: 1, points: 5, maxPoints: 6, reason: 'Đủ ý.' },
        { no: 2, points: 3.5, maxPoints: 4, reason: 'Ví dụ tốt.' },
      ],
    });
    expect(ExamResultEssaySchema.parse(essay)).toEqual(essay);
    expect(JSON.stringify(essay)).not.toContain('không gửi cho SV');
  });

  it('GĐ6 a blank answer scores 0 without criteria', () => {
    expect(resultEssayOf(input(null))).toMatchObject({ points: 0, maxPoints: 10, criteria: [] });
  });

  it('GĐ6 an essay handed to a human grader shows the final score without the AI reasons', () => {
    const essay = resultEssayOf(
      input({
        finalScore: 7,
        needsHuman: true,
        aiGrading: { runs: { '1': run([2, 1], ['a', 'b']), '2': run([6, 4], ['c', 'd']) }, failures: {} },
      }),
    );
    expect(essay).toMatchObject({ points: 7, criteria: [] });
  });

  it('GĐ6 skill scores on the 0–100 scale', () => {
    expect(
      resultSkillsOf([
        { skill: 'Java', scoreX100: 7_250 },
        { skill: 'SQL', scoreX100: null },
      ]),
    ).toEqual([
      { skill: 'Java', score: 72.5 },
      { skill: 'SQL', score: null },
    ]);
  });
});
