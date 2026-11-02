import type { ScvWeights } from '@srm/shared';
import { averageX100, halvesBySkill, skillGroupScore, toBasisPoints, weigh } from './scv.js';
import type { SkillRequirements, SkillVerdicts } from './skill-match.js';

// skill_fit: how well a CV meets the skills of a JD, on the S_cv scale (FR-40, US-3.5 AC-10). It
// ranks the JDs of a student before the Matching Agent scores projects, so only the top M go to the
// LLM (US-3.2). The two skill groups score as in S_cv; their weights are rescaled to sum to 1.

export type SkillFitWeights = Pick<ScvWeights, 'scv_weight_must_have' | 'scv_weight_nice_to_have'>;

/**
 * skill_fit × 100, an integer 0–10 000, rounded half-up once as `computeScv` does. An empty group
 * gives its weight to the other; with no weight left the fit is 0.
 */
export function skillFit(requirements: SkillRequirements, verdicts: SkillVerdicts, weights: SkillFitWeights): number {
  const halves = halvesBySkill(verdicts);
  const { sum, applicableBp } = weigh([
    [skillGroupScore(requirements.must_have, halves), toBasisPoints(weights.scv_weight_must_have)],
    [skillGroupScore(requirements.nice_to_have, halves), toBasisPoints(weights.scv_weight_nice_to_have)],
  ]);
  return averageX100(sum, applicableBp);
}

/** What the top-M ranking reads of one CV × JD pair. */
export interface SkillFitCandidate {
  jdId: number;
  skillFitX100: number;
}

/** Best skill_fit first; equal skill_fit by `jdId` ascending, so the order is fixed. */
export function compareSkillFit(a: SkillFitCandidate, b: SkillFitCandidate): number {
  return b.skillFitX100 - a.skillFitX100 || a.jdId - b.jdId;
}
