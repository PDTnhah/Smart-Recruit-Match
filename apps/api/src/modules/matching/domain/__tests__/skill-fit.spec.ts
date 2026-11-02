import { CampaignConfigSchema, type JdSkillRequirement, type ScvWeights, scvWeightsOf } from '@srm/shared';
import { computeScv } from '../scv.js';
import { compareSkillFit, skillFit, type SkillFitWeights } from '../skill-fit.js';
import type { SkillRequirements, SkillVerdicts } from '../skill-match.js';
import { skillVerdict } from './fixtures/verdicts.js';

const req = (skill: string, weight = 1): JdSkillRequirement => ({ skill, level: 'BASIC', weight });

/** The PRD › S_cv sample: must-have 50 %, nice-to-have 0 %. */
const requirements: SkillRequirements = {
  must_have: [req('Java'), req('SQL'), req('Docker')],
  nice_to_have: [req('Redis')],
};
const verdicts: SkillVerdicts = {
  must_have: [
    skillVerdict('Java', 'INTERMEDIATE', 'MET', "Dự án 'Quản lý thư viện'"),
    skillVerdict('SQL', 'BASIC', 'PARTIAL', 'MySQL'),
    skillVerdict('Docker', 'BASIC', 'NOT_MET', null),
  ],
  nice_to_have: [skillVerdict('Redis', 'BASIC', 'NOT_MET', null)],
};

const DEFAULT = scvWeightsOf(CampaignConfigSchema.parse({}));

const weights = (mustHave: number, niceToHave: number): SkillFitWeights => ({
  scv_weight_must_have: mustHave,
  scv_weight_nice_to_have: niceToHave,
});

/** S_cv with only the two skill criteria weighted: what skill_fit must equal. */
const scvOfSkillsOnly = (fitWeights: SkillFitWeights): number => {
  const scvWeights: ScvWeights = {
    ...fitWeights,
    scv_weight_project: 0,
    scv_weight_education: 0,
    scv_weight_language: 0,
  };
  return computeScv({
    requirements: { ...requirements, hard_conditions: { majors: [], min_study_year: null, min_gpa: null, required_languages: [] } },
    criteria: { ...verdicts, project_relevance: { score_0_4: 4, reason: '...' }, education: { major_match: 'EXACT' }, language: null },
    education: { gpa4: 4 },
    weights: scvWeights,
  }).scvX100;
};

describe('GĐ3 skill_fit: skill groups of S_cv with their weights rescaled; ties by jdId (US-3.5 AC-10)', () => {
  it('GĐ3 skill_fit: PRD sample with default weights is (50 × 0.40 + 0 × 0.15) / 0.55', () => {
    expect(skillFit(requirements, verdicts, DEFAULT)).toBe(3_636);
    expect(scvOfSkillsOnly(DEFAULT)).toBe(3_636);
  });

  it.each([
    [weights(0.4, 0.15)],
    [weights(0.25, 0.25)],
    [weights(0.33, 0.01)],
    [weights(0, 0.2)],
    [weights(0.7, 0)],
  ])('GĐ3 skill_fit equals S_cv weighted on the skill groups alone (%j)', (fitWeights) => {
    expect(skillFit(requirements, verdicts, fitWeights)).toBe(scvOfSkillsOnly(fitWeights));
  });

  it('GĐ3 skill_fit: an empty group gives its weight to the other; no weight left gives 0', () => {
    const mustOnly = { ...requirements, nice_to_have: [] };
    expect(skillFit(mustOnly, verdicts, DEFAULT)).toBe(5_000);
    expect(skillFit(requirements, verdicts, weights(0, 0))).toBe(0);
    expect(skillFit({ must_have: [], nice_to_have: [] }, verdicts, DEFAULT)).toBe(0);
  });

  it('GĐ3 skill_fit ranking: best first, equal skill_fit by jdId ascending', () => {
    const ranked = [
      { jdId: 3, skillFitX100: 5_000 },
      { jdId: 12, skillFitX100: 7_000 },
      { jdId: 1, skillFitX100: 5_000 },
      { jdId: 2, skillFitX100: 0 },
    ].sort(compareSkillFit);
    expect(ranked.map((candidate) => candidate.jdId)).toEqual([12, 1, 3, 2]);
  });
});
