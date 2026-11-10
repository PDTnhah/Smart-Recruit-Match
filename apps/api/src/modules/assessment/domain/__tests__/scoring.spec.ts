import {
  computeParts,
  computeSFinal,
  computeSkillScores,
  computeSTest,
  gradeMultipleChoice,
  type PartWeights,
  questionWeights,
  type ScoredQuestion,
} from '../scoring.js';

// US-4.4 AC-1, AC-8–AC-10 (PRD › Điểm test, S_final, AGENTS › Invariants 1, 9, CONTEXT D53): code
// grades the multiple-choice questions and computes every score, × 100, rounded half-up once.

const mcq = (questionId: number, skill = 'SQL'): ScoredQuestion => ({ questionId, type: 'MCQ', skill, maxPoints: 1 });
const essay = (questionId: number, maxPoints: number, skill = 'SQL'): ScoredQuestion => ({
  questionId,
  type: 'ESSAY',
  skill,
  maxPoints,
});
const scored = (entries: [number, number][]) => new Map(entries);
const DEFAULT_WEIGHTS: PartWeights = { A: 60, B: 40 };

/** 10 MCQ (ids 1–10) and two essays: 11 worth 10 points, 12 worth 5. */
const PAPER: ScoredQuestion[] = [...Array.from({ length: 10 }, (_, i) => mcq(i + 1)), essay(11, 10), essay(12, 5)];

/** 7 MCQ right; essay 11 scored 6 / 10, essay 12 scored 3.5 / 5. */
const WORKED = scored([
  ...Array.from({ length: 10 }, (_, i): [number, number] => [i + 1, i < 7 ? 100 : 0]),
  [11, 600],
  [12, 350],
]);

describe('GĐ6 multiple choice (US-4.4 AC-1)', () => {
  it('GĐ6 multiple choice: the key option scores 1, any other 0, essays are left out', () => {
    const answers = [
      { questionId: 1, answer: { code: 'k3x9aa', option: 2 } },
      { questionId: 2, answer: { code: 'p0q1bb', option: 0 } },
      { questionId: 11, answer: { text: 'Chỉ mục giúp tìm nhanh hơn.' } },
    ];
    const keys = new Map([
      [1, 2],
      [2, 1],
    ]);
    expect(gradeMultipleChoice(answers, keys)).toEqual([
      { questionId: 1, points: 1 },
      { questionId: 2, points: 0 },
    ]);
  });

  it('GĐ6 multiple choice: an answered question without an answer key is a broken bank', () => {
    expect(() => gradeMultipleChoice([{ questionId: 3, answer: { code: 'a', option: 0 } }], new Map())).toThrow(
      'question 3 has no correct option',
    );
  });

  it('GĐ6 part A is the share of right answers × 100; an unanswered question counts 0', () => {
    const sevenRight = scored(Array.from({ length: 7 }, (_, i): [number, number] => [i + 1, 100]));
    expect(computeParts(PAPER, sevenRight)).toEqual({ scoreAX100: 7000, scoreBX100: 0 });
  });
});

describe('GĐ6 S_test (US-4.4 AC-8)', () => {
  it.each([
    { name: 'nothing answered', paper: PAPER, weights: DEFAULT_WEIGHTS, scores: scored([]), sTest: 0, parts: [0, 0] },
    {
      name: 'everything right',
      paper: PAPER,
      weights: DEFAULT_WEIGHTS,
      scores: scored([...PAPER.map((q): [number, number] => [q.questionId, q.maxPoints * 100])]),
      sTest: 10_000,
      parts: [10_000, 10_000],
    },
    // 0.6 × 70 + 0.4 × (0.6 + 0.7) / 2 × 100 = 42 + 26 = 68.
    { name: 'worked example', paper: PAPER, weights: DEFAULT_WEIGHTS, scores: WORKED, sTest: 6_800, parts: [7_000, 6_500] },
    // 50 × 1/3 = 16.666…: rounds down to 16.67; part A 33.333… to 33.33.
    {
      name: 'thirds round once, at the end',
      paper: [mcq(1), mcq(2), mcq(3), essay(4, 10)],
      weights: { A: 50, B: 50 },
      scores: scored([[1, 100]]),
      sTest: 1_667,
      parts: [3_333, 0],
    },
    // 100 × (0.01 / 200) × 100 = 0.5 hundredths: half rounds up.
    {
      name: 'half a hundredth rounds up',
      paper: [mcq(1), essay(2, 200)],
      weights: { A: 0, B: 100 },
      scores: scored([
        [1, 100],
        [2, 1],
      ]),
      sTest: 1,
      parts: [10_000, 1],
    },
  ])('GĐ6 S_test table: $name', ({ paper, weights, scores, sTest, parts }) => {
    expect(computeSTest(paper, weights, scores)).toBe(sTest);
    expect(computeParts(paper, scores)).toEqual({ scoreAX100: parts[0], scoreBX100: parts[1] });
  });

  it('GĐ6 S_test = wA·A + wB·B: every question of a part weighs the same (D53)', () => {
    const weights = questionWeights(PAPER, DEFAULT_WEIGHTS);
    expect(weights.get(1)).toEqual({ num: 60n, den: 10n });
    expect(weights.get(12)).toEqual({ num: 40n, den: 2n });
    const { scoreAX100, scoreBX100 } = computeParts(PAPER, WORKED);
    expect(computeSTest(PAPER, DEFAULT_WEIGHTS, WORKED)).toBe((60 * scoreAX100 + 40 * scoreBX100) / 100);
  });

  it('GĐ6 refuses part weights that do not add up to 100, an empty part, a score above the points', () => {
    expect(() => computeSTest(PAPER, { A: 60, B: 30 }, WORKED)).toThrow('add up to 90');
    expect(() => computeSTest([mcq(1)], { A: 100, B: 0 }, scored([]))).toThrow('no question of part B');
    expect(() => computeSTest(PAPER, DEFAULT_WEIGHTS, scored([[12, 501]]))).toThrow('question 12 scored 501 / 500');
    expect(() => computeSTest(PAPER, DEFAULT_WEIGHTS, scored([[1, 50.5]]))).toThrow('question 1 scored 50.5');
  });
});

describe('GĐ6 skill scores (US-4.4 AC-9)', () => {
  it('GĐ6 skill scores: a paper of one skill scores it S_test', () => {
    expect(computeSkillScores(PAPER, DEFAULT_WEIGHTS, WORKED)).toEqual([{ skill: 'SQL', scoreX100: 6_800 }]);
  });

  it('GĐ6 skill scores: the weighted mean of the success rates, by skill', () => {
    // Part A: 4 MCQ of 15% each; part B: one essay of 40%.
    const paper = [mcq(1, 'SQL'), mcq(2, 'SQL'), mcq(3, 'Git'), mcq(4, 'Git'), essay(5, 10, 'Git')];
    const scores = scored([
      [1, 100],
      [3, 100],
      [4, 100],
      [5, 500],
    ]);
    // SQL: 15 / 30 = 50. Git: (15 + 15 + 40 × 0.5) / 70 = 71.428… → 71.43.
    expect(computeSkillScores(paper, DEFAULT_WEIGHTS, scores)).toEqual([
      { skill: 'Git', scoreX100: 7_143 },
      { skill: 'SQL', scoreX100: 5_000 },
    ]);
    expect(computeSTest(paper, DEFAULT_WEIGHTS, scores)).toBe(6_500);
  });

  it('GĐ6 skill scores: one skill spelt two ways counts once, as the blueprint matches it', () => {
    // The cells 'Java' (part A) and 'java ' (part B) are one skill by skillKey.
    const paper = [mcq(1, 'Java'), essay(2, 10, 'java ')];
    const scores = scored([
      [1, 100],
      [2, 500],
    ]);
    expect(computeSkillScores(paper, DEFAULT_WEIGHTS, scores)).toEqual([
      { skill: 'Java', scoreX100: computeSTest(paper, DEFAULT_WEIGHTS, scores) },
    ]);
  });

  it('GĐ6 skill scores: a skill only in a part of weight 0 has no score', () => {
    const paper = [mcq(1, 'SQL'), essay(2, 10, 'Docker')];
    expect(computeSkillScores(paper, { A: 100, B: 0 }, scored([[2, 1_000]]))).toEqual([
      { skill: 'Docker', scoreX100: null },
      { skill: 'SQL', scoreX100: 0 },
    ]);
  });
});

describe('GĐ6 S_final (US-4.4 AC-10)', () => {
  it.each([
    { scv: 6_410, sTest: 6_800, alpha: 40, beta: 60, sFinal: 6_644 },
    // 0.45 × 0.10 = 0.045: half a hundredth rounds up.
    { scv: 10, sTest: 0, alpha: 45, beta: 55, sFinal: 5 },
    { scv: 10_000, sTest: 10_000, alpha: 40, beta: 60, sFinal: 10_000 },
    { scv: 0, sTest: 0, alpha: 40, beta: 60, sFinal: 0 },
    { scv: 3_000, sTest: 9_000, alpha: 0, beta: 100, sFinal: 9_000 },
  ])('GĐ6 S_final = α·S_cv + β·S_test: $scv, $sTest → $sFinal', ({ scv, sTest, alpha, beta, sFinal }) => {
    expect(computeSFinal(scv, sTest, { alphaX100: alpha, betaX100: beta })).toBe(sFinal);
  });

  it('GĐ6 S_final, rejects α + β ≠ 1 and scores off the scale', () => {
    expect(() => computeSFinal(5_000, 5_000, { alphaX100: 40, betaX100: 50 })).toThrow('α + β is 0.9, not 1');
    expect(() => computeSFinal(5_000, 5_000, { alphaX100: 0.4, betaX100: 99.6 })).toThrow('not whole hundredths');
    expect(() => computeSFinal(10_001, 5_000, { alphaX100: 40, betaX100: 60 })).toThrow('not 0–10000');
  });
});
