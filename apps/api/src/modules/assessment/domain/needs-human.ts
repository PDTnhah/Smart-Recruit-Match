import {
  EXAM_GRADING_REASONS,
  type ExamGradingReason,
  type GradingConfidence,
  type GradingFlag,
} from '@srm/shared';
import { computeSTest, type FinalScoresX100, type PartWeights, type ScoredQuestion } from './scoring.js';

// Which essay answers go to a human grader (US-4.4 AC-6, ARCHITECTURE › Pipeline › Grader, AGENTS ›
// Invariant 1, CONTEXT D53). Code decides from the Grader's two passes; the LLM never does. Pure.

/** Two passes differ too much when |p1 − p2| exceeds this share of the question's points. */
export const DIVERGENCE_PERCENT = 15;

/** S_test within this many hundredths of θ_test (5 points) sends every answered essay to a human. */
export const NEAR_THRESHOLD_X100 = 500;

/** One pass of the Grader over an answer: its points (Σ criteria, checked against the rubric), or none. */
export type PassOutcome =
  | { kind: 'GRADED'; points: number; confidence: GradingConfidence; flags: readonly GradingFlag[] }
  | { kind: 'FAILED' };

/** An answered essay still without a final score or a handoff; a pass not in yet is null. */
export interface EssayToDecide {
  questionId: number;
  /** Σ the rubric's `max_points`. */
  maxPoints: number;
  passes: readonly [PassOutcome | null, PassOutcome | null];
}

export interface NeedsHumanInput {
  paper: readonly ScoredQuestion[];
  weights: PartWeights;
  /** Scores already final × 100: the MCQ grades, and essays graded before (by staff, US-4.5). */
  settled: FinalScoresX100;
  essays: readonly EssayToDecide[];
  /** θ_test × 100, from `campaigns.config` through `toHundredths`. */
  thetaTestX100: number;
}

export type NeedsHumanDecision =
  /** Some pass is not in yet: nothing is decided. */
  | { kind: 'WAITING'; questionIds: number[] }
  | {
      kind: 'DECIDED';
      /** Essays whose final score is the Grader's: the mean of the two passes × 100. */
      scores: { questionId: number; finalScoreX100: number }[];
      /** Essays for a human grader, with every reason in the order of EXAM_GRADING_REASONS. */
      handoffs: { questionId: number; reasons: ExamGradingReason[] }[];
    };

function checkPoints(essay: EssayToDecide, pass: PassOutcome): void {
  if (pass.kind !== 'GRADED') return;
  if (!Number.isInteger(pass.points) || pass.points < 0 || pass.points > essay.maxPoints) {
    throw new Error(`decideNeedsHuman: question ${essay.questionId} has ${pass.points} of ${essay.maxPoints} points`);
  }
}

/** The reasons of one answer by itself, and its AI score × 100 when both passes graded it. */
function judge(essay: EssayToDecide): { reasons: Set<ExamGradingReason>; aiScoreX100: number | null } {
  const passes = essay.passes as readonly PassOutcome[];
  for (const pass of passes) checkPoints(essay, pass);
  const reasons = new Set<ExamGradingReason>();
  const graded = passes.filter((pass) => pass.kind === 'GRADED');
  if (graded.length < passes.length) reasons.add('AI_FAILED');
  if (graded.some((pass) => pass.confidence === 'LOW')) reasons.add('LOW_CONFIDENCE');
  if (graded.some((pass) => pass.flags.length > 0)) reasons.add('FLAGGED');
  const [first, second] = graded;
  if (graded.length < 2 || !first || !second) return { reasons, aiScoreX100: null };
  if (Math.abs(first.points - second.points) * 100 > DIVERGENCE_PERCENT * essay.maxPoints) reasons.add('RUNS_DIVERGE');
  // The mean of two whole numbers, × 100: always a whole number.
  return { reasons, aiScoreX100: (first.points + second.points) * 50 };
}

/**
 * AC-6: for each answered essay, a final score from the Grader or a handoff to a human grader:
 * - RUNS_DIVERGE: |p1 − p2| × 100 > 15 × the question's points;
 * - LOW_CONFIDENCE: a pass is LOW; FLAGGED: a pass has a flag; AI_FAILED: a pass has no grade;
 * - NEAR_THRESHOLD: once every essay has both passes graded, S_test with those scores within 5
 *   points of θ_test (|sTestX100 − θ × 100| ≤ 500) sends every essay of the session to a human.
 * A blank essay has no row, scores 0 and is never sent (the caller leaves it out of `essays`).
 */
export function decideNeedsHuman(input: NeedsHumanInput): NeedsHumanDecision {
  const waiting = input.essays.filter((essay) => essay.passes.some((pass) => pass === null));
  if (waiting.length > 0) return { kind: 'WAITING', questionIds: waiting.map((essay) => essay.questionId) };

  const judged = input.essays.map((essay) => ({ essay, ...judge(essay) }));
  if (judged.length > 0 && judged.every(({ aiScoreX100 }) => aiScoreX100 !== null)) {
    const provisional = new Map(input.settled);
    for (const { essay, aiScoreX100 } of judged) provisional.set(essay.questionId, aiScoreX100!);
    const sTestX100 = computeSTest(input.paper, input.weights, provisional);
    if (Math.abs(sTestX100 - input.thetaTestX100) <= NEAR_THRESHOLD_X100) {
      for (const { reasons } of judged) reasons.add('NEAR_THRESHOLD');
    }
  }

  const decision: Extract<NeedsHumanDecision, { kind: 'DECIDED' }> = { kind: 'DECIDED', scores: [], handoffs: [] };
  for (const { essay, reasons, aiScoreX100 } of judged) {
    if (reasons.size > 0) {
      decision.handoffs.push({
        questionId: essay.questionId,
        reasons: EXAM_GRADING_REASONS.filter((reason) => reasons.has(reason)),
      });
    } else {
      decision.scores.push({ questionId: essay.questionId, finalScoreX100: aiScoreX100! });
    }
  }
  return decision;
}
