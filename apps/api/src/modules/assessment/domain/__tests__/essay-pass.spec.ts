import type { ExamAnswerAiGrading, GradingResult, QuestionRubric, StoredGradingRun } from '@srm/shared';
import {
  passKeyOf,
  passOutcomes,
  passPoints,
  rubricPoints,
  rubricProblem,
  withGraderFlags,
  withPass,
} from '../essay-pass.js';

// US-4.4 AC-4, AC-5 (CONTEXT D53, LESSONS §32, §33): the backend checks each pass against the
// rubric again and stores it once, whatever order the messages arrive in.

const RUBRIC: QuestionRubric = [
  { criterion: 'Nêu đúng khái niệm', max_points: 6 },
  { criterion: 'Có ví dụ', max_points: 4 },
];

const grade = (points: number[], extra: Partial<GradingResult> = {}): GradingResult => ({
  criteria: points.map((p, index) => ({ index, points: p, reason: `Lý do ${index}` })),
  confidence: 'HIGH',
  flags: [],
  ...extra,
});

const run = (points: number[], extra: Partial<GradingResult> = {}): StoredGradingRun => ({
  model: 'claude-opus-5-5',
  prompt_version: 'grader/v1',
  grading: grade(points, extra),
  points: points.reduce((a, b) => a + b, 0),
});

describe('US-4.4 AC-4: the backend checks the points against the rubric', () => {
  it.each([
    ['fits', [6, 4], null],
    ['zero everywhere', [0, 0], null],
    ['one point above a criterion', [7, 3], 'criterion 0: 7 points of at most 6'],
    ['a criterion missing', [5], 'criteria [0] do not follow the 2 rubric criteria'],
    ['a criterion too many', [5, 3, 1], 'criteria [0, 1, 2] do not follow the 2 rubric criteria'],
  ])('GĐ6 %s', (_case, points, problem) => {
    expect(rubricProblem(grade(points), RUBRIC)).toBe(problem);
  });

  it('GĐ6 criteria out of rubric order do not fit', () => {
    const swapped: GradingResult = {
      ...grade([4, 3]),
      criteria: [
        { index: 1, points: 4, reason: 'b' },
        { index: 0, points: 3, reason: 'a' },
      ],
    };
    expect(rubricProblem(swapped, RUBRIC)).toBe('criteria [1, 0] do not follow the 2 rubric criteria');
  });

  it('GĐ6 code adds the criterion points (AD-2)', () => {
    expect(passPoints(grade([5, 3]))).toBe(8);
    expect(rubricPoints(RUBRIC)).toBe(10);
  });
});

describe('US-4.4 AC-5: each pass is stored once', () => {
  it('GĐ6 a pass already graded or failed is not written again', () => {
    const first = withPass(null, '1', { kind: 'RUN', run: run([5, 4]) })!;
    expect(first).toEqual({ runs: { '1': run([5, 4]) }, failures: {} });
    expect(withPass(first, '1', { kind: 'RUN', run: run([1, 1]) })).toBeNull();
    expect(withPass(first, '1', { kind: 'FAILURE', failure: { code: 'EXPIRED', needs_review: false, prompt_version: null } })).toBeNull();
    const both = withPass(first, '2', {
      kind: 'FAILURE',
      failure: { code: 'LLM_REFUSAL', needs_review: true, prompt_version: 'grader/v1' },
    })!;
    expect(passOutcomes(both)).toEqual([
      { kind: 'GRADED', points: 9, confidence: 'HIGH', flags: [] },
      { kind: 'FAILED' },
    ]);
  });

  it('GĐ6 a pass not in yet reads as null', () => {
    expect(passOutcomes(null)).toEqual([null, null]);
  });

  it('GĐ6 only passes 1 and 2 exist', () => {
    expect(passKeyOf(1)).toBe('1');
    expect(passKeyOf(2)).toBe('2');
    expect(() => passKeyOf(3)).toThrow('pass 3');
  });
});

describe("US-4.4 AC-4: the Grader's flags go to exam_sessions.flags", () => {
  const flagged: ExamAnswerAiGrading = {
    runs: { '1': run([1, 0], { flags: ['INSTRUCTION_IN_ANSWER'] }), '2': run([1, 0], { flags: ['INSTRUCTION_IN_ANSWER'] }) },
    failures: {},
  };

  it('GĐ6 each flag once per question; nothing new is null', () => {
    const flags = withGraderFlags([], [
      { questionId: 12, grading: flagged },
      { questionId: 13, grading: { runs: { '1': run([3, 2]) }, failures: {} } },
    ]);
    expect(flags).toEqual([{ code: 'INSTRUCTION_IN_ANSWER', questionId: 12 }]);
    expect(withGraderFlags(flags!, [{ questionId: 12, grading: flagged }])).toBeNull();
  });
});
