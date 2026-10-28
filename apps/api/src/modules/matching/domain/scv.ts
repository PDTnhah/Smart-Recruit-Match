import {
  type JdRequirements,
  type JdSkillRequirement,
  type MajorMatch,
  type MatchCriteria,
  type MatchVerdict,
  type ScvWeightKey,
  type ScvWeights,
  skillKey,
  toHundredths,
} from '@srm/shared';

// S_cv = Σ wᵢ·sᵢ, computed by code from the Matching Agent's per-criterion verdicts (PRD › S_cv,
// AD-2, US-3.1, CONTEXT D41). Exact fractions in bigint, rounded half-up once at the end, so the
// result never depends on float rounding and changing the weights never needs the LLM again.

export const SCV_CRITERIA = ['must_have', 'nice_to_have', 'project', 'education', 'language'] as const;

export type ScvCriterion = (typeof SCV_CRITERIA)[number];

/** The campaign config key of a criterion's weight; fails to compile if the names drift apart. */
const weightKey = (criterion: ScvCriterion): ScvWeightKey => `scv_weight_${criterion}`;

/**
 * A criterion with nothing to score (no skill in the group, skill weights that round to 0, no
 * required language) drops out of both sums, so its weight goes to the others in proportion.
 */
export const EMPTY_CRITERION_POLICY = 'REDISTRIBUTE';

/** Verdicts in half points: MET = 1, PARTIAL = 0.5, NOT_MET = 0 (PRD › S_cv). */
const VERDICT_HALVES: Readonly<Record<MatchVerdict, bigint>> = { MET: 2n, PARTIAL: 1n, NOT_MET: 0n };

/** Major đúng / gần / khác on the 0–100 scale (PRD › S_cv, học vấn). */
export const MAJOR_MATCH_SCORE: Readonly<Record<MajorMatch, number>> = { EXACT: 100, RELATED: 60, OTHER: 20 };

/** Học vấn = major × 0.6 + GPA on the 100 scale × 0.4 (PRD › S_cv), in percent. */
const MAJOR_SHARE = 60n;
const GPA_SHARE = 40n;

/** A 4-point GPA times 25 is on the 100 scale; a project rubric score 0–4 times 25 too. */
const TO_100_SCALE = 25n;

/** Criterion weights are compared in basis points (AC-9). */
const BASIS_POINTS = 10_000;

/** A non-negative fraction; `den` > 0. Not reduced: bigint does not overflow. */
interface Ratio {
  num: bigint;
  den: bigint;
}

const ZERO: Ratio = { num: 0n, den: 1n };

const add = (a: Ratio, b: Ratio): Ratio => ({ num: a.num * b.den + b.num * a.den, den: a.den * b.den });

const times = (a: Ratio, k: bigint): Ratio => ({ num: a.num * k, den: a.den });

const over = (a: Ratio, k: bigint): Ratio => ({ num: a.num, den: a.den * k });

/** Half-up rounding of a non-negative fraction to an integer. */
const roundHalfUp = (a: Ratio): number => Number((2n * a.num + a.den) / (2n * a.den));

/** A verdict without evidence counts as NOT_MET (AGENTS › Invariant 5). */
function halvesOf(verdict: { verdict: MatchVerdict; evidence: string | null } | null | undefined): bigint {
  if (!verdict || verdict.evidence === null) return 0n;
  return VERDICT_HALVES[verdict.verdict];
}

/**
 * Skill-weighted average of one group on the 0–100 scale, or null when the group is empty. Each JD
 * skill takes the verdict the LLM gave it under either group; a skill it left out counts NOT_MET,
 * a skill it named twice its lower verdict, and skills the JD does not list are ignored, so the
 * LLM can change neither the skills nor their weights.
 */
function skillGroupScore(skills: readonly JdSkillRequirement[], halvesByKey: ReadonlyMap<string, bigint>): Ratio | null {
  let weighted = 0n;
  let totalWeight = 0n;
  for (const skill of skills) {
    const weight = BigInt(toHundredths(skill.weight));
    weighted += weight * (halvesByKey.get(skillKey(skill.skill)) ?? 0n);
    totalWeight += weight;
  }
  if (totalWeight === 0n) return null;
  return { num: 100n * weighted, den: 2n * totalWeight };
}

function halvesBySkill(criteria: MatchCriteria): Map<string, bigint> {
  const halves = new Map<string, bigint>();
  for (const verdict of [...criteria.must_have, ...criteria.nice_to_have]) {
    const key = skillKey(verdict.skill);
    const value = halvesOf(verdict);
    const seen = halves.get(key);
    halves.set(key, seen === undefined || value < seen ? value : seen);
  }
  return halves;
}

function educationScore(majorMatch: MajorMatch, gpa4: number | null): Ratio {
  const major = BigInt(MAJOR_MATCH_SCORE[majorMatch]);
  // gpaX100 × 25 / 100 is the GPA on the 100 scale; a student without a GPA gets 0 for that part.
  const gpaX100 = gpa4 === null ? 0n : BigInt(toHundredths(gpa4));
  return { num: MAJOR_SHARE * major * 100n + GPA_SHARE * gpaX100 * TO_100_SCALE, den: 100n * 100n };
}

export interface ScvInput {
  /** The JD's confirmed requirements: skills with their weights, and the required languages. */
  requirements: JdRequirements;
  criteria: MatchCriteria;
  /** `students.gpa` on the 4-point scale (CONTEXT D41). */
  education: { gpa4: number | null };
  weights: ScvWeights;
}

/**
 * One row per criterion. Values are rounded one by one for display; `scvX100` comes from the exact
 * fractions, so the contributions may add up to it ± 1.
 */
export interface ScvBreakdownRow {
  criterion: ScvCriterion;
  applicable: boolean;
  /** sᵢ × 100; null when the criterion is empty. */
  scoreX100: number | null;
  /** wᵢ from the campaign config, in basis points. */
  weightBp: number;
  /** wᵢ after redistribution: 0 when empty, the applicable ones sum to 10 000 (± rounding). */
  effectiveWeightBp: number;
  /** wᵢ·sᵢ × 100 with the effective weight. */
  contributionX100: number;
}

export interface ScvResult {
  /** S_cv × 100, an integer 0–10 000. */
  scvX100: number;
  breakdown: ScvBreakdownRow[];
}

export function computeScv({ requirements, criteria, education, weights }: ScvInput): ScvResult {
  const halves = halvesBySkill(criteria);
  const scores: Readonly<Record<ScvCriterion, Ratio | null>> = {
    must_have: skillGroupScore(requirements.must_have, halves),
    nice_to_have: skillGroupScore(requirements.nice_to_have, halves),
    project: { num: TO_100_SCALE * BigInt(criteria.project_relevance.score_0_4), den: 1n },
    education: educationScore(criteria.education.major_match, education.gpa4),
    language:
      requirements.hard_conditions.required_languages.length > 0
        ? { num: 100n * halvesOf(criteria.language), den: 2n }
        : null,
  };
  const weightBp = (criterion: ScvCriterion): number => Math.round(weights[weightKey(criterion)] * BASIS_POINTS);

  let weightedSum = ZERO;
  let applicableBp = 0n;
  for (const criterion of SCV_CRITERIA) {
    const score = scores[criterion];
    if (score === null) continue;
    const bp = BigInt(weightBp(criterion));
    weightedSum = add(weightedSum, times(score, bp));
    applicableBp += bp;
  }
  // Every applicable criterion has weight 0: nothing to average, so no division by 0.
  const share = (value: Ratio): number => (applicableBp === 0n ? 0 : roundHalfUp(over(times(value, 100n), applicableBp)));

  const breakdown = SCV_CRITERIA.map((criterion): ScvBreakdownRow => {
    const score = scores[criterion];
    const bp = weightBp(criterion);
    if (score === null) {
      return { criterion, applicable: false, scoreX100: null, weightBp: bp, effectiveWeightBp: 0, contributionX100: 0 };
    }
    return {
      criterion,
      applicable: true,
      scoreX100: roundHalfUp(times(score, 100n)),
      weightBp: bp,
      effectiveWeightBp:
        applicableBp === 0n ? 0 : roundHalfUp({ num: BigInt(bp) * BigInt(BASIS_POINTS), den: applicableBp }),
      contributionX100: share(times(score, BigInt(bp))),
    };
  });

  return { scvX100: share(weightedSum), breakdown };
}
