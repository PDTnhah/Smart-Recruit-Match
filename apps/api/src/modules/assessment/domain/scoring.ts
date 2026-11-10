import {
  EXAM_PART_OF_TYPE,
  EXAM_PARTS,
  type ExamPart,
  type ExamStoredAnswer,
  type QuestionType,
  skillKey,
  type StoredSkillScore,
} from '@srm/shared';
import { add, divide, multiply, over, type Ratio, roundHalfUp, times, ZERO } from '@srm/shared/scoring';

// Scores of an exam session (US-4.4 AC-1, AC-8–AC-10, PRD › Điểm test, S_final, AGENTS ›
// Invariants 1, 2, 9, CONTEXT D53). Pure: no NestJS, no Drizzle, no LLM.
//
// Each question has a success rate r_q: an MCQ 1 or 0, an essay its points / its rubric's points, a
// blank question 0. Within a part every question weighs the same, w_q = the part's weight_percent /
// the part's question count, so S_test = Σ w_q·r_q = wA·A + wB·B. Exact fractions in bigint, rounded
// half-up once at the end of each function, as S_cv is (US-3.1).

/** A question of the paper as scoring reads it. */
export interface ScoredQuestion {
  questionId: number;
  type: QuestionType;
  skill: string;
  /** Points the question is worth: 1 for an MCQ, the sum of the rubric's `max_points` for an essay. */
  maxPoints: number;
}

/** `weight_percent` of each part, from the bank's blueprint; they add up to 100. */
export type PartWeights = Readonly<Record<ExamPart, number>>;

/**
 * The final score of each answered question in hundredths of a point (`final_score` × 100). A
 * question of the paper missing from it was not answered and scores 0.
 */
export type FinalScoresX100 = ReadonlyMap<number, number>;

/** Points of an MCQ (AC-1). */
export const MCQ_POINTS = 1;

/** A score on the 0–100 scale × 100, as numeric(5,2) stores it: 0 to 10 000. */
const SCALE_X100 = 10_000n;

export interface McqGrade {
  questionId: number;
  points: 0 | 1;
}

/**
 * AC-1: the code's grade of each answered MCQ: 1 when the option picked is the answer key's, else
 * 0. Essay answers are left out; an MCQ not answered has no row and scores 0 later. `keys` maps a
 * question to its correct option (`answer_key.correct_option`); an answered MCQ without one is a
 * broken bank, so it throws.
 */
export function gradeMultipleChoice(
  answers: readonly { questionId: number; answer: ExamStoredAnswer }[],
  keys: ReadonlyMap<number, number>,
): McqGrade[] {
  return answers.flatMap(({ questionId, answer }): McqGrade[] => {
    if (!('option' in answer)) return [];
    const key = keys.get(questionId);
    if (key === undefined) throw new Error(`gradeMultipleChoice: question ${questionId} has no correct option`);
    return [{ questionId, points: answer.option === key ? 1 : 0 }];
  });
}

/** r_q as an exact fraction. */
function successRate(question: ScoredQuestion, scores: FinalScoresX100): Ratio {
  if (!Number.isInteger(question.maxPoints) || question.maxPoints <= 0) {
    throw new Error(`scoring: question ${question.questionId} has maxPoints ${question.maxPoints}`);
  }
  const scoreX100 = scores.get(question.questionId) ?? 0;
  if (!Number.isInteger(scoreX100) || scoreX100 < 0 || scoreX100 > question.maxPoints * 100) {
    throw new Error(`scoring: question ${question.questionId} scored ${scoreX100} / ${question.maxPoints * 100}`);
  }
  return { num: BigInt(scoreX100), den: BigInt(question.maxPoints * 100) };
}

function questionsByPart(paper: readonly ScoredQuestion[]): Record<ExamPart, ScoredQuestion[]> {
  const parts: Record<ExamPart, ScoredQuestion[]> = { A: [], B: [] };
  for (const question of paper) parts[EXAM_PART_OF_TYPE[question.type]].push(question);
  for (const part of EXAM_PARTS) {
    if (parts[part].length === 0) throw new Error(`scoring: the paper has no question of part ${part}`);
  }
  return parts;
}

/**
 * w_q of each question of the paper, in percent of S_test: the part's `weight_percent` divided by
 * the part's question count in the paper (D53).
 */
export function questionWeights(paper: readonly ScoredQuestion[], weights: PartWeights): Map<number, Ratio> {
  for (const part of EXAM_PARTS) {
    if (!Number.isInteger(weights[part]) || weights[part] < 0) {
      throw new Error(`scoring: part ${part} weighs ${weights[part]}`);
    }
  }
  if (weights.A + weights.B !== 100) throw new Error(`scoring: part weights add up to ${weights.A + weights.B}, not 100`);
  const parts = questionsByPart(paper);
  const result = new Map<number, Ratio>();
  for (const part of EXAM_PARTS) {
    const weight: Ratio = { num: BigInt(weights[part]), den: BigInt(parts[part].length) };
    for (const question of parts[part]) result.set(question.questionId, weight);
  }
  return result;
}

export interface PartScores {
  /** Part A on the 0–100 scale × 100: the mean success rate of its questions. */
  scoreAX100: number;
  scoreBX100: number;
}

/** Score of each part: the mean r_q of its questions × 100 (PRD › Điểm test). */
export function computeParts(paper: readonly ScoredQuestion[], scores: FinalScoresX100): PartScores {
  const parts = questionsByPart(paper);
  const partScore = (part: ExamPart): number => {
    const sum = parts[part].reduce((acc, question) => add(acc, successRate(question, scores)), ZERO);
    return roundHalfUp(over(times(sum, SCALE_X100), BigInt(parts[part].length)));
  };
  return { scoreAX100: partScore('A'), scoreBX100: partScore('B') };
}

/**
 * AC-8: S_test × 100 = Σ w_q·r_q × 100, from 0 to 10 000. The caller runs it once every answered
 * question has its final score.
 */
export function computeSTest(paper: readonly ScoredQuestion[], weights: PartWeights, scores: FinalScoresX100): number {
  const weightOf = questionWeights(paper, weights);
  const sum = paper.reduce(
    (acc, question) => add(acc, multiply(weightOf.get(question.questionId)!, successRate(question, scores))),
    ZERO,
  );
  return roundHalfUp(times(sum, 100n));
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * AC-9: the score of each skill of the paper, Σ w_q·r_q / Σ w_q × 100 over its questions, so a
 * paper of one skill scores it S_test. Questions are grouped by `skillKey`, as the blueprint
 * matches them, under the name their first question in the paper gives. Null for a skill whose
 * questions all weigh 0 (in a part of weight 0): it does not count toward S_test. Sorted by name.
 */
export function computeSkillScores(
  paper: readonly ScoredQuestion[],
  weights: PartWeights,
  scores: FinalScoresX100,
): StoredSkillScore[] {
  const weightOf = questionWeights(paper, weights);
  const bySkill = new Map<string, { skill: string; weighted: Ratio; weight: Ratio }>();
  for (const question of paper) {
    const weight = weightOf.get(question.questionId)!;
    const key = skillKey(question.skill);
    const acc = bySkill.get(key) ?? { skill: question.skill, weighted: ZERO, weight: ZERO };
    bySkill.set(key, {
      skill: acc.skill,
      weighted: add(acc.weighted, multiply(weight, successRate(question, scores))),
      weight: add(acc.weight, weight),
    });
  }
  return [...bySkill.values()]
    .sort((a, b) => byText(a.skill, b.skill))
    .map(({ skill, weighted, weight }) => ({
      skill,
      scoreX100: weight.num === 0n ? null : roundHalfUp(times(divide(weighted, weight), SCALE_X100)),
    }));
}

/** α and β × 100, from `campaigns.config` through `toHundredths`. */
export interface FinalWeights {
  alphaX100: number;
  betaX100: number;
}

const isScoreX100 = (value: number) => Number.isInteger(value) && value >= 0 && value <= 10_000;

/**
 * AC-10: S_final × 100 = α·S_cv + β·S_test, from the two stored scores × 100, rounded half-up once.
 * α + β must be 1 (PRD › S_final): anything else throws.
 */
export function computeSFinal(scvX100: number, sTestX100: number, { alphaX100, betaX100 }: FinalWeights): number {
  if (!isScoreX100(scvX100) || !isScoreX100(sTestX100)) {
    throw new Error(`computeSFinal: scores ${scvX100} and ${sTestX100} are not 0–10000`);
  }
  if (!Number.isInteger(alphaX100) || !Number.isInteger(betaX100) || alphaX100 < 0 || betaX100 < 0) {
    throw new Error(`computeSFinal: weights ${alphaX100} and ${betaX100} are not whole hundredths`);
  }
  if (alphaX100 + betaX100 !== 100) throw new Error(`computeSFinal: α + β is ${(alphaX100 + betaX100) / 100}, not 1`);
  const sum = BigInt(alphaX100) * BigInt(scvX100) + BigInt(betaX100) * BigInt(sTestX100);
  return roundHalfUp({ num: sum, den: 100n });
}
