import {
  type JdSkillRequirement,
  type MatchZoneCoverage,
  SKILL_ZONES,
  type SkillZone,
  skillMatchKey,
  toHundredths,
} from '@srm/shared';
import { roundHalfUp, times } from '@srm/shared/scoring';
import { halvesBySkill, skillGroupScore } from './scv.js';
import type { SkillRequirements, SkillVerdicts } from './skill-match.js';
import type { TaxonomyIndex } from './taxonomy-index.js';

// Coverage of a JD by zone (FR-40, US-3.5 AC-9, PRD › Vùng và họ kỹ năng): which fields of work the
// JD needs and how much of each the CV covers. For display and suggestions only; zones are no
// criterion of S_cv.

/** Shared with the web app, which shows it (US-3.3). */
export type ZoneCoverage = MatchZoneCoverage;

/**
 * Every zone the JD needs, in SKILL_ZONES order. A JD skill outside the catalogue, or without a
 * family, is in no zone.
 */
export function zoneCoverage(
  requirements: SkillRequirements,
  verdicts: SkillVerdicts,
  taxonomy: TaxonomyIndex,
): ZoneCoverage[] {
  const halves = halvesBySkill(verdicts);
  const byZone = new Map<SkillZone, JdSkillRequirement[]>();
  for (const requirement of [...requirements.must_have, ...requirements.nice_to_have]) {
    const zone = taxonomy.byKey.get(skillMatchKey(requirement.skill))?.zone ?? null;
    if (zone === null) continue;
    const skills = byZone.get(zone);
    if (skills === undefined) byZone.set(zone, [requirement]);
    else skills.push(requirement);
  }

  return SKILL_ZONES.flatMap((zone) => {
    const skills = byZone.get(zone);
    if (skills === undefined) return [];
    const score = skillGroupScore(skills, halves);
    return [
      {
        zone,
        demandWeightX100: skills.reduce((sum, skill) => sum + toHundredths(skill.weight), 0),
        coverageX100: score === null ? 0 : roundHalfUp(times(score, 100n)),
      },
    ];
  });
}
