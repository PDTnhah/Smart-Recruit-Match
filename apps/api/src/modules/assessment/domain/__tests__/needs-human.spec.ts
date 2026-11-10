import type { GradingConfidence, GradingFlag } from '@srm/shared';
import { decideNeedsHuman, type EssayToDecide, type NeedsHumanInput, type PassOutcome } from '../needs-human.js';
import type { ScoredQuestion } from '../scoring.js';

// US-4.4 AC-6 (ARCHITECTURE › Pipeline › Grader, AGENTS › Invariant 1, CONTEXT D53): code decides,
// from the Grader's two passes, which essays a human grades.

const graded = (points: number, confidence: GradingConfidence = 'HIGH', flags: GradingFlag[] = []): PassOutcome => ({
  kind: 'GRADED',
  points,
  confidence,
  flags,
});
const FAILED: PassOutcome = { kind: 'FAILED' };

/** Part A: 4 MCQ of 15% each; part B: essays 11 and 12, worth 10 points, 20% each. */
const PAPER: ScoredQuestion[] = [
  ...[1, 2, 3, 4].map((questionId): ScoredQuestion => ({ questionId, type: 'MCQ', skill: 'SQL', maxPoints: 1 })),
  { questionId: 11, type: 'ESSAY', skill: 'SQL', maxPoints: 10 },
  { questionId: 12, type: 'ESSAY', skill: 'SQL', maxPoints: 10 },
];

/** All four MCQ right: 60 points of S_test before the essays. */
const ALL_RIGHT = new Map([1, 2, 3, 4].map((questionId): [number, number] => [questionId, 100]));

const essay = (questionId: number, first: PassOutcome | null, second: PassOutcome | null): EssayToDecide => ({
  questionId,
  maxPoints: 10,
  passes: [first, second],
});

const input = (essays: EssayToDecide[], overrides: Partial<NeedsHumanInput> = {}): NeedsHumanInput => ({
  paper: PAPER,
  weights: { A: 60, B: 40 },
  settled: ALL_RIGHT,
  essays,
  thetaTestX100: 4_000,
  ...overrides,
});

describe('GĐ6 handoff rules and boundaries (US-4.4 AC-6)', () => {
  it('GĐ6 two close, sure, clean passes: the final score is their mean', () => {
    const decision = decideNeedsHuman(input([essay(11, graded(6), graded(7)), essay(12, graded(8), graded(8))]));
    expect(decision).toEqual({
      kind: 'DECIDED',
      scores: [
        { questionId: 11, finalScoreX100: 650 },
        { questionId: 12, finalScoreX100: 800 },
      ],
      handoffs: [],
    });
  });

  // Essay 12 is worth 10 points: 15% of it is 1.5 points.
  it.each([
    { name: 'passes 1 point apart (10%)', first: graded(5), second: graded(6), reasons: [] },
    { name: 'passes 1.5 points apart would be exactly 15%: 2 points is over', first: graded(5), second: graded(7), reasons: ['RUNS_DIVERGE'] },
    { name: 'one pass LOW', first: graded(5, 'LOW'), second: graded(5), reasons: ['LOW_CONFIDENCE'] },
    { name: 'MEDIUM is not low', first: graded(5, 'MEDIUM'), second: graded(5, 'MEDIUM'), reasons: [] },
    {
      name: 'an instruction in the answer',
      first: graded(5, 'HIGH', ['INSTRUCTION_IN_ANSWER']),
      second: graded(5),
      reasons: ['FLAGGED'],
    },
    { name: 'one pass failed', first: graded(5), second: FAILED, reasons: ['AI_FAILED'] },
    { name: 'both passes failed', first: FAILED, second: FAILED, reasons: ['AI_FAILED'] },
    {
      name: 'several reasons, in the order of EXAM_GRADING_REASONS',
      first: graded(9, 'HIGH', ['INSTRUCTION_IN_ANSWER']),
      second: graded(2, 'LOW'),
      reasons: ['RUNS_DIVERGE', 'LOW_CONFIDENCE', 'FLAGGED'],
    },
  ])('GĐ6 handoff rules and boundaries: $name', ({ first, second, reasons }) => {
    const decision = decideNeedsHuman(input([essay(11, graded(6), graded(6)), essay(12, first, second)]));
    if (decision.kind !== 'DECIDED') throw new Error('expected a decision');
    expect(decision.handoffs).toEqual(reasons.length === 0 ? [] : [{ questionId: 12, reasons }]);
    expect(decision.scores.map((score) => score.questionId)).toEqual(reasons.length === 0 ? [11, 12] : [11]);
  });

  it('GĐ6 handoff rules and boundaries: a difference of exactly 15% stays with the Grader', () => {
    const essay20: EssayToDecide = { questionId: 11, maxPoints: 20, passes: [graded(10), graded(13)] };
    const paper = PAPER.map((question) => (question.questionId === 11 ? { ...question, maxPoints: 20 } : question));
    // |10 − 13| × 100 = 300 = 15 × 20: not more than 15%.
    expect(decideNeedsHuman(input([essay20], { paper }))).toMatchObject({ handoffs: [] });
    const apart = { ...essay20, passes: [graded(10), graded(14)] as const };
    expect(decideNeedsHuman(input([apart], { paper }))).toMatchObject({
      handoffs: [{ questionId: 11, reasons: ['RUNS_DIVERGE'] }],
    });
  });

  // Two MCQ right (30) and both essays 5 / 10 (10 + 10): S_test = 50.00.
  const halfway = new Map([1, 2].map((questionId): [number, number] => [questionId, 100]));
  const fives = () => [essay(11, graded(5), graded(5)), essay(12, graded(5), graded(5))];

  it.each([
    { theta: 4_500, near: true, name: 'S_test = θ + 5' },
    { theta: 5_500, near: true, name: 'S_test = θ − 5' },
    { theta: 5_000, near: true, name: 'S_test = θ' },
    { theta: 4_499, near: false, name: 'S_test = θ + 5.01' },
    { theta: 5_501, near: false, name: 'S_test = θ − 5.01' },
  ])('GĐ6 handoff rules and boundaries: near θ_test, $name', ({ theta, near }) => {
    const decision = decideNeedsHuman(input(fives(), { settled: halfway, thetaTestX100: theta }));
    if (decision.kind !== 'DECIDED') throw new Error('expected a decision');
    expect(decision.handoffs).toEqual(
      near
        ? [
            { questionId: 11, reasons: ['NEAR_THRESHOLD'] },
            { questionId: 12, reasons: ['NEAR_THRESHOLD'] },
          ]
        : [],
    );
  });

  it('GĐ6 near θ_test is checked only once every essay has both passes graded', () => {
    const decision = decideNeedsHuman(
      input([essay(11, FAILED, graded(5)), essay(12, graded(5), graded(5))], { settled: halfway, thetaTestX100: 5_000 }),
    );
    expect(decision).toEqual({
      kind: 'DECIDED',
      scores: [{ questionId: 12, finalScoreX100: 500 }],
      handoffs: [{ questionId: 11, reasons: ['AI_FAILED'] }],
    });
  });

  it('GĐ6 near θ_test adds to the reasons an essay already has', () => {
    const decision = decideNeedsHuman(
      input([essay(11, graded(5, 'LOW'), graded(5)), essay(12, graded(5), graded(5))], {
        settled: halfway,
        thetaTestX100: 5_000,
      }),
    );
    expect(decision).toMatchObject({
      handoffs: [
        { questionId: 11, reasons: ['LOW_CONFIDENCE', 'NEAR_THRESHOLD'] },
        { questionId: 12, reasons: ['NEAR_THRESHOLD'] },
      ],
    });
  });

  it('GĐ6 a blank essay scores 0 and is never handed over; with no essay to decide, nothing is', () => {
    // S_test = 30 with both essays blank, θ = 30: near, but there is no answer for a human to grade.
    expect(decideNeedsHuman(input([], { settled: halfway, thetaTestX100: 3_000 }))).toEqual({
      kind: 'DECIDED',
      scores: [],
      handoffs: [],
    });
  });

  it('GĐ6 waits while a pass is not in', () => {
    expect(decideNeedsHuman(input([essay(11, graded(5), null), essay(12, graded(5), graded(5))]))).toEqual({
      kind: 'WAITING',
      questionIds: [11],
    });
  });

  it('GĐ6 refuses points above the question or not whole: the backend checks them before', () => {
    expect(() => decideNeedsHuman(input([essay(11, graded(11), graded(5))]))).toThrow('11 of 10 points');
    expect(() => decideNeedsHuman(input([essay(11, graded(4.5), graded(5))]))).toThrow('4.5 of 10 points');
  });
});
