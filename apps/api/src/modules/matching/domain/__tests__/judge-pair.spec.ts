import { CampaignConfigSchema, type JdRequirements, MatchCriteriaSchema, scvWeightsOf } from '@srm/shared';
import { judgePair, type MatchingCv } from '../judge-pair.js';
import { buildSkillEvidence } from '../skill-evidence.js';
import { hardFilterFacts } from '../student-facts.js';
import { listed, profile, project } from './fixtures/profiles.js';
import { INDEX } from './fixtures/taxonomy.js';

const INTAKE_END = new Date('2025-11-15T00:00:00Z');
const WEIGHTS = scvWeightsOf(CampaignConfigSchema.parse({}));

const requirements = (change: Partial<JdRequirements['hard_conditions']> = {}): JdRequirements => ({
  must_have: [
    { skill: 'Java', level: 'BASIC', weight: 2 },
    { skill: 'Docker', level: 'BASIC', weight: 1 },
  ],
  nice_to_have: [{ skill: 'SQL', level: 'BASIC', weight: 1 }],
  hard_conditions: { majors: [], min_study_year: null, min_gpa: 2.5, required_languages: [], ...change },
  preferred_languages: ['TOEIC 550'],
});

const masked = profile({
  summary: 'Sinh viên năm 3',
  skills: [listed('MySQL')],
  projects: [project({ name: 'Quản lý thư viện', technologies: ['Spring Boot'] })],
  languages: [{ language: 'Tiếng Anh', level: 'TOEIC 650' }],
});

const cv = (gpa4: number | null): MatchingCv => ({
  facts: hardFilterFacts({ major: 'Công nghệ thông tin', gpa4 }, masked, INTAKE_END),
  evidence: buildSkillEvidence(masked, INDEX, INTAKE_END),
});

describe('GĐ3 code part of one pair: hard filter, verdicts, zones, gaps, skill_fit (US-3.2 AC-1)', () => {
  it('BR-03 GĐ3 a pair that fails the hard filter keeps only its reasons', () => {
    expect(judgePair(cv(2.1), { requirements: requirements(), positionGroup: 'BACKEND' }, INDEX, WEIGHTS)).toEqual({
      eligible: false,
      ineligibleReasons: [{ code: 'GPA_BELOW_MIN', required: 2.5, actual: 2.1 }],
    });
  });

  it('GĐ3 an eligible pair has every code verdict, valid against the contract once the LLM adds the project', () => {
    const judged = judgePair(cv(3.2), { requirements: requirements(), positionGroup: 'BACKEND' }, INDEX, WEIGHTS);
    if (!judged.eligible) throw new Error('expected an eligible pair');
    const { criteria, skillFitX100 } = judged;
    expect(criteria.must_have.map((v) => [v.skill, v.verdict, v.match_kind])).toEqual([
      ['Java', 'MET', 'IMPLIED'],
      ['Docker', 'NOT_MET', 'NONE'],
    ]);
    expect(criteria.nice_to_have.map((v) => [v.skill, v.verdict, v.match_kind])).toEqual([['SQL', 'PARTIAL', 'IMPLIED']]);
    expect(criteria.education).toEqual({ major_match: 'EXACT', major_unrecognized: false });
    expect(criteria.language).toMatchObject({ verdict: 'MET', evidence: 'Tiếng Anh TOEIC 650' });
    expect(criteria.gaps.map((gap) => [gap.skill, gap.verdict])).toEqual([
      ['Docker', 'NOT_MET'],
      ['SQL', 'PARTIAL'],
    ]);
    expect(criteria.zones.map((zone) => zone.zone).length).toBeGreaterThan(0);
    expect(skillFitX100).toBeGreaterThan(0);
    const { must_have, nice_to_have, education, language } = criteria;
    const project_relevance = { score_0_4: 3, reason: 'Dự án Java', evidence: [] };
    const full = { must_have, nice_to_have, education, language, project_relevance };
    expect(MatchCriteriaSchema.safeParse(full).success).toBe(true);
  });
});
