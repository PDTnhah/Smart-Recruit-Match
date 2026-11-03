import type {
  HardFilterFacts,
  IneligibleReason,
  JdRequirements,
  MatchCodeCriteria,
  PositionGroup,
} from '@srm/shared';
import { gapsOf } from './gaps.js';
import { checkHardFilters } from './hard-filter.js';
import { scoreLanguage } from './language-score.js';
import { majorMatch } from './major-match.js';
import type { CvSkillEvidence } from './skill-evidence.js';
import { skillFit, type SkillFitWeights } from './skill-fit.js';
import { matchSkills } from './skill-match.js';
import type { TaxonomyIndex } from './taxonomy-index.js';
import { zoneCoverage } from './zone-profile.js';

/** A CV as a run reads it: the student's facts, and the skill evidence built once per CV. */
export interface MatchingCv {
  facts: HardFilterFacts;
  evidence: CvSkillEvidence;
}

/** The confirmed requirements of one JD version. */
export interface MatchingJd {
  requirements: JdRequirements;
  positionGroup: PositionGroup;
}

export type PairJudgement =
  | { eligible: false; ineligibleReasons: IneligibleReason[] }
  | { eligible: true; criteria: MatchCodeCriteria; skillFitX100: number };

/**
 * The code part of one CV × JD pair (US-3.2 AC-1, FR-14, FR-40, CONTEXT D42): the hard filter, then
 * for a pair that passes, every verdict code judges, the coverage by zone, the gaps and skill_fit.
 * The project score of the Matching Agent comes later; S_cv needs both (AD-2).
 */
export function judgePair(
  cv: MatchingCv,
  jd: MatchingJd,
  taxonomy: TaxonomyIndex,
  weights: SkillFitWeights,
): PairJudgement {
  const filter = checkHardFilters(cv.facts, jd.requirements.hard_conditions);
  if (!filter.eligible) return { eligible: false, ineligibleReasons: filter.ineligibleReasons };

  const verdicts = matchSkills(jd.requirements, cv.evidence, taxonomy);
  const majors = jd.requirements.hard_conditions.majors;
  return {
    eligible: true,
    criteria: {
      ...verdicts,
      education: majorMatch({ majors, positionGroup: jd.positionGroup }, cv.facts.major),
      language: scoreLanguage(jd.requirements, cv.facts.languageCertificates),
      zones: zoneCoverage(jd.requirements, verdicts, taxonomy),
      gaps: gapsOf(verdicts),
    },
    skillFitX100: skillFit(jd.requirements, verdicts, weights),
  };
}
