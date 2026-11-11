import type { ExamAnswerAiGrading, QuestionRubric } from '@srm/shared';
import { ValidationFailedError } from '../../../../common/errors/index.js';
import { aiPassesOf, manualGradeOf, questionNoOf } from '../manual-grade.js';

// US-4.5 AC-2, AC-3 (AD-2, CONTEXT D54): the grader enters points per criterion; code adds them.

const RUBRIC: QuestionRubric = [
  { criterion: 'Nêu đúng khái niệm', max_points: 6 },
  { criterion: 'Có ví dụ', max_points: 4 },
];

const issuesOf = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    if (error instanceof ValidationFailedError) return (error.details as { issues: { path: string }[] }).issues.map((i) => i.path);
    throw error;
  }
  throw new Error('expected a validation error');
};

describe('US-4.5 AC-3: manualGradeOf', () => {
  it('GĐ6 adds the criterion points into the final score × 100 and keeps a trimmed-out empty note as null', () => {
    expect(manualGradeOf(RUBRIC, [{ index: 0, points: 5 }, { index: 1, points: 2 }], 'Thiếu ví dụ thực tế')).toEqual({
      finalScoreX100: 700,
      stored: { criteria: [{ index: 0, points: 5 }, { index: 1, points: 2 }], note: 'Thiếu ví dụ thực tế' },
    });
    expect(manualGradeOf(RUBRIC, [{ index: 0, points: 0 }, { index: 1, points: 0 }], '').stored.note).toBeNull();
    expect(manualGradeOf(RUBRIC, [{ index: 0, points: 6 }, { index: 1, points: 4 }], undefined).finalScoreX100).toBe(1000);
  });

  it('GĐ6 rejects a criterion above its max_points at criteria.N.points', () => {
    expect(issuesOf(() => manualGradeOf(RUBRIC, [{ index: 0, points: 7 }, { index: 1, points: 5 }], null))).toEqual([
      'criteria.0.points',
      'criteria.1.points',
    ]);
  });

  it('GĐ6 rejects a missing criterion at criteria, and one out of order at criteria.N.index', () => {
    expect(issuesOf(() => manualGradeOf(RUBRIC, [{ index: 0, points: 1 }], null))).toEqual(['criteria']);
    expect(issuesOf(() => manualGradeOf(RUBRIC, [{ index: 1, points: 1 }, { index: 0, points: 1 }], null))).toEqual([
      'criteria.0.index',
      'criteria.1.index',
    ]);
  });
});

describe('US-4.5 AC-2: aiPassesOf shows both passes (CONTEXT D54)', () => {
  it('GĐ6 a graded pass with its reasons, and a failed pass with its code', () => {
    const grading: ExamAnswerAiGrading = {
      runs: {
        '1': {
          model: 'claude-opus-5-5',
          prompt_version: 'grader/v1',
          points: 7,
          grading: {
            criteria: [
              { index: 0, points: 5, reason: 'Đúng' },
              { index: 1, points: 2, reason: 'Thiếu' },
            ],
            confidence: 'LOW',
            flags: ['INSTRUCTION_IN_ANSWER'],
          },
        },
      },
      failures: { '2': { code: 'LLM_REFUSED', needs_review: true, prompt_version: 'grader/v1' } },
    };
    expect(aiPassesOf(grading)).toEqual([
      {
        passNo: 1,
        points: 7,
        confidence: 'LOW',
        flags: ['INSTRUCTION_IN_ANSWER'],
        criteria: [
          { index: 0, points: 5, reason: 'Đúng' },
          { index: 1, points: 2, reason: 'Thiếu' },
        ],
        failureCode: null,
      },
      { passNo: 2, points: null, confidence: null, flags: [], criteria: [], failureCode: 'LLM_REFUSED' },
    ]);
  });

  it('GĐ6 no grading shows no pass', () => {
    expect(aiPassesOf(null)).toEqual([]);
    expect(aiPassesOf({ runs: {}, failures: {} })).toEqual([]);
  });
});

describe('US-4.5 AC-2: questionNoOf', () => {
  it('GĐ6 numbers the paper from 1 in draw order', () => {
    expect(questionNoOf([30, 10, 20], 20)).toBe(3);
    expect(() => questionNoOf([30], 40)).toThrow('not on the paper');
  });
});
