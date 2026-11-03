import type { HardFilterFacts, JdRequirements, MatchAssessment, MatchCodeCriteria, ScvWeights } from '@srm/shared';
import { computeScv, type ScvResult } from './scv.js';

/** What S_cv of one stored pair rests on (US-3.2 AC-10, AC-11). */
export interface StoredPair {
  /** The code part of the run: every verdict but the project score. */
  criteria: MatchCodeCriteria;
  /** Only the project score is read from the Matching Agent; nothing in it is a total (AD-2). */
  assessment: Pick<MatchAssessment, 'project_relevance'>;
  /** The facts the run read, so a recompute scores the same GPA. */
  facts: Pick<HardFilterFacts, 'gpa4'>;
}

/**
 * S_cv of a pair from what `core.match_results` keeps (FR-14, AD-2, CONTEXT D42, D46): the code
 * verdicts of the run with the project score of the Matching Agent, the JD's requirements for the
 * skill weights and the campaign's current weights. Used when the result comes back and again when
 * the weights change, so neither needs the LLM.
 */
export function pairScv(pair: StoredPair, requirements: JdRequirements, weights: ScvWeights): ScvResult {
  const { must_have, nice_to_have, education, language } = pair.criteria;
  return computeScv({
    requirements,
    criteria: { must_have, nice_to_have, education, language, project_relevance: pair.assessment.project_relevance },
    education: { gpa4: pair.facts.gpa4 },
    weights,
  });
}
