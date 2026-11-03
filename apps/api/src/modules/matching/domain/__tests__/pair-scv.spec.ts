import { CampaignConfigSchema, type JdRequirements, type MatchCodeCriteria, scvWeightsOf } from '@srm/shared';
import { pairScv, type StoredPair } from '../pair-scv.js';
import { skillVerdict } from './fixtures/verdicts.js';

const REQUIREMENTS: JdRequirements = {
  must_have: [
    { skill: 'Java', level: 'INTERMEDIATE', weight: 1 },
    { skill: 'SQL', level: 'BASIC', weight: 1 },
  ],
  nice_to_have: [{ skill: 'Redis', level: 'BASIC', weight: 1 }],
  hard_conditions: { majors: [], min_study_year: null, min_gpa: null, required_languages: [] },
  preferred_languages: [],
};

const CRITERIA: MatchCodeCriteria = {
  must_have: [
    skillVerdict('Java', 'INTERMEDIATE', 'MET', "Dự án 'Quản lý thư viện'"),
    skillVerdict('SQL', 'BASIC', 'PARTIAL', 'MySQL'),
  ],
  nice_to_have: [skillVerdict('Redis', 'BASIC', 'NOT_MET', null)],
  education: { major_match: 'EXACT', major_unrecognized: false },
  language: null,
  zones: [],
  gaps: [{ skill: 'Redis', group: 'nice_to_have', levelRequired: 'BASIC', verdict: 'NOT_MET' }],
};

const pair = (score: number, change: Partial<StoredPair> = {}): StoredPair => ({
  criteria: CRITERIA,
  assessment: { project_relevance: { score_0_4: score, reason: 'Dự án web', evidence: ['Quản lý thư viện'] } },
  facts: { gpa4: 3.2 },
  ...change,
});

const WEIGHTS = scvWeightsOf(CampaignConfigSchema.parse({}));

describe('pairScv (US-3.2 AC-10, AC-11)', () => {
  it('AD-2 GĐ3 S_cv of a stored pair: code verdicts, the project score of the LLM, the snapshot GPA', () => {
    // must 75, nice 0, project 75, education 60 + 0.4 × 80 = 92; no language, so its 0.1 is shared out:
    // (0.4 × 75 + 0.15 × 0 + 0.2 × 75 + 0.15 × 92) / 0.9 = 65.33.
    const result = pairScv(pair(3), REQUIREMENTS, WEIGHTS);
    expect(result.scvX100).toBe(6533);
    expect(result.breakdown.map((row) => [row.criterion, row.scoreX100])).toEqual([
      ['must_have', 7500],
      ['nice_to_have', 0],
      ['project', 7500],
      ['education', 9200],
      ['language', null],
    ]);
  });

  it('AD-2 nothing of the assessment but score_0_4 counts; the weights do', () => {
    const base = pairScv(pair(3), REQUIREMENTS, WEIGHTS).scvX100;
    const commented = {
      project_relevance: { score_0_4: 3, reason: 'Khác', evidence: [] },
      strengths: ['Nhiều dự án'],
      suggestions: [],
      summary: 'Rất phù hợp.',
      evidence_check: [{ quote: 'bịa', score: 10, matched: false }],
    };
    expect(pairScv(pair(3, { assessment: commented }), REQUIREMENTS, WEIGHTS).scvX100).toBe(base);
    expect(pairScv(pair(4), REQUIREMENTS, WEIGHTS).scvX100).toBeGreaterThan(base);

    const projectOnly = { ...WEIGHTS, scv_weight_must_have: 0, scv_weight_nice_to_have: 0, scv_weight_education: 0, scv_weight_language: 0, scv_weight_project: 1 };
    expect(pairScv(pair(3), REQUIREMENTS, projectOnly).scvX100).toBe(7500);
  });
});
