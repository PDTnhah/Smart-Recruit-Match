import {
  DEFAULT_CAMPAIGN_CONFIG,
  type JdRequirements,
  type MatchCriteria,
  type ScvWeights,
  scvWeightsOf,
  CampaignConfigSchema,
} from '@srm/shared';
import { computeScv, EMPTY_CRITERION_POLICY, type ScvInput } from '../scv.js';

const requirements = (change: Partial<JdRequirements> = {}): JdRequirements => ({
  must_have: [
    { skill: 'Java', level: 'INTERMEDIATE', weight: 1 },
    { skill: 'SQL', level: 'BASIC', weight: 1 },
    { skill: 'Docker', level: 'BASIC', weight: 1 },
  ],
  nice_to_have: [{ skill: 'Redis', level: 'BASIC', weight: 1 }],
  hard_conditions: { majors: [], min_study_year: null, min_gpa: null, required_languages: ['Tiếng Anh (TOEIC 500)'] },
  ...change,
});

/** The PRD › S_cv sample output of the Matching Agent, without `education.gpa_4` (CONTEXT D41). */
const criteria = (change: Partial<MatchCriteria> = {}): MatchCriteria => ({
  must_have: [
    { skill: 'Java', level_required: 'INTERMEDIATE', verdict: 'MET', evidence: "Dự án 'Quản lý thư viện'" },
    { skill: 'SQL', level_required: 'BASIC', verdict: 'PARTIAL', evidence: "Chỉ liệt kê 'MySQL'" },
    { skill: 'Docker', level_required: 'BASIC', verdict: 'NOT_MET', evidence: null },
  ],
  nice_to_have: [{ skill: 'Redis', level_required: 'BASIC', verdict: 'NOT_MET', evidence: null }],
  project_relevance: { score_0_4: 3, reason: '...' },
  education: { major_match: 'EXACT' },
  language: { verdict: 'MET', evidence: 'TOEIC 650' },
  ...change,
});

const DEFAULT_WEIGHTS = scvWeightsOf(CampaignConfigSchema.parse({}));

const weights = (mustHave: number, niceToHave: number, project: number, education: number, language: number): ScvWeights => ({
  scv_weight_must_have: mustHave,
  scv_weight_nice_to_have: niceToHave,
  scv_weight_project: project,
  scv_weight_education: education,
  scv_weight_language: language,
});

const input = (change: Partial<ScvInput> = {}): ScvInput => ({
  requirements: requirements(),
  criteria: criteria(),
  education: { gpa4: 3.2 },
  weights: DEFAULT_WEIGHTS,
  ...change,
});

const scoreOf = (result: ReturnType<typeof computeScv>, criterion: string) =>
  result.breakdown.find((row) => row.criterion === criterion)?.scoreX100;

describe('GĐ3 S_cv computed by code from per-criterion verdicts (AD-2, US-3.1, CONTEXT D41)', () => {
  it('GĐ3 S_cv: PRD sample output yields 58.80 with default weights', () => {
    expect(DEFAULT_WEIGHTS).toEqual(weights(0.4, 0.15, 0.2, 0.15, 0.1));
    expect(DEFAULT_CAMPAIGN_CONFIG.scv_weight_must_have).toBe(0.4);
    expect(computeScv(input())).toEqual({
      scvX100: 5880,
      breakdown: [
        { criterion: 'must_have', applicable: true, scoreX100: 5000, weightBp: 4000, effectiveWeightBp: 4000, contributionX100: 2000 },
        { criterion: 'nice_to_have', applicable: true, scoreX100: 0, weightBp: 1500, effectiveWeightBp: 1500, contributionX100: 0 },
        { criterion: 'project', applicable: true, scoreX100: 7500, weightBp: 2000, effectiveWeightBp: 2000, contributionX100: 1500 },
        { criterion: 'education', applicable: true, scoreX100: 9200, weightBp: 1500, effectiveWeightBp: 1500, contributionX100: 1380 },
        { criterion: 'language', applicable: true, scoreX100: 10000, weightBp: 1000, effectiveWeightBp: 1000, contributionX100: 1000 },
      ],
    });
  });

  it('GĐ3 S_cv: must-have score is skill-weighted average', () => {
    const weighted = requirements({
      must_have: [
        { skill: 'Java', level: 'INTERMEDIATE', weight: 3 },
        { skill: 'SQL', level: 'BASIC', weight: 1 },
        { skill: 'Docker', level: 'BASIC', weight: 1 },
      ],
    });
    // 100 × (3·1 + 1·0.5 + 1·0) / 5 = 70.
    expect(scoreOf(computeScv(input({ requirements: weighted })), 'must_have')).toBe(7000);
  });

  it('AD-2 S_cv recomputes from stored criteria when weights change', () => {
    const stored = input();
    // 0.5·50 + 0.1·0 + 0.2·75 + 0.1·92 + 0.1·100 = 59.2.
    expect(computeScv({ ...stored, weights: weights(0.5, 0.1, 0.2, 0.1, 0.1) }).scvX100).toBe(5920);
    expect(computeScv({ ...stored, weights: weights(0, 0, 1, 0, 0) }).scvX100).toBe(7500);
    expect(computeScv(stored).scvX100).toBe(5880);
  });

  it('GĐ3 S_cv: empty criterion is redistributed, never NaN', () => {
    expect(EMPTY_CRITERION_POLICY).toBe('REDISTRIBUTE');
    const noExtras = input({
      requirements: requirements({
        nice_to_have: [],
        hard_conditions: { majors: [], min_study_year: null, min_gpa: null, required_languages: [] },
      }),
      criteria: criteria({ nice_to_have: [], language: null }),
    });
    // (0.4·50 + 0.2·75 + 0.15·92) / 0.75 = 65.0666…
    const result = computeScv(noExtras);
    expect(result.scvX100).toBe(6507);
    expect(result.breakdown.map((row) => [row.criterion, row.applicable, row.effectiveWeightBp])).toEqual([
      ['must_have', true, 5333],
      ['nice_to_have', false, 0],
      ['project', true, 2667],
      ['education', true, 2000],
      ['language', false, 0],
    ]);
    expect(scoreOf(result, 'language')).toBeNull();

    // Skill weights that round to 0 leave the group empty too.
    const tiny = requirements({ nice_to_have: [{ skill: 'Redis', level: 'BASIC', weight: 0.001 }] });
    expect(computeScv(input({ requirements: tiny })).breakdown[1]).toMatchObject({ applicable: false, scoreX100: null });

    // Every remaining criterion has weight 0: 0, not a division by 0.
    const onlyLanguage = computeScv({ ...noExtras, weights: weights(0, 0, 0, 0, 1) });
    expect(onlyLanguage.scvX100).toBe(0);
    expect(onlyLanguage.breakdown.every((row) => row.effectiveWeightBp === 0 && row.contributionX100 === 0)).toBe(true);
  });

  it('GĐ3 S_cv: integer x100 arithmetic and conversions', () => {
    const onlyEducation = weights(0, 0, 0, 1, 0);
    const education = (majorMatch: 'EXACT' | 'RELATED' | 'OTHER', gpa4: number | null) =>
      computeScv(input({ criteria: criteria({ education: { major_match: majorMatch } }), education: { gpa4 }, weights: onlyEducation }))
        .scvX100;
    // Major 100 / 60 / 20 × 0.6 + GPA × 25 × 0.4; no GPA counts 0 for that part.
    expect(education('EXACT', 4)).toBe(10000);
    expect(education('RELATED', null)).toBe(3600);
    expect(education('OTHER', 3.33)).toBe(4530);

    const language = (verdict: 'MET' | 'PARTIAL' | 'NOT_MET') =>
      computeScv(input({ criteria: criteria({ language: { verdict, evidence: 'TOEIC 650' } }), weights: weights(0, 0, 0, 0, 1) }))
        .scvX100;
    expect([language('MET'), language('PARTIAL'), language('NOT_MET')]).toEqual([10000, 5000, 0]);

    const project = (score: number) =>
      computeScv(input({ criteria: criteria({ project_relevance: { score_0_4: score, reason: '...' } }), weights: weights(0, 0, 1, 0, 0) }))
        .scvX100;
    expect([0, 1, 2, 3, 4].map(project)).toEqual([0, 2500, 5000, 7500, 10000]);

    // 100 × 1 / 32 = 3.125: half-up gives 3.13 (banker's rounding would give 3.12).
    const halfway = requirements({
      must_have: [
        { skill: 'Java', level: 'BASIC', weight: 1 },
        { skill: 'SQL', level: 'BASIC', weight: 10 },
        { skill: 'Docker', level: 'BASIC', weight: 10 },
        { skill: 'Git', level: 'BASIC', weight: 10 },
        { skill: 'Linux', level: 'BASIC', weight: 1 },
      ],
    });
    const onlyJava = criteria({ must_have: [{ skill: 'Java', level_required: 'BASIC', verdict: 'MET', evidence: 'x' }] });
    expect(computeScv(input({ requirements: halfway, criteria: onlyJava, weights: weights(1, 0, 0, 0, 0) })).scvX100).toBe(313);

    // 2/3 of the must-have weight: 66.666… rounds up once, at the end.
    const twoOfThree = criteria({
      must_have: [
        { skill: 'Java', level_required: 'BASIC', verdict: 'MET', evidence: 'x' },
        { skill: 'SQL', level_required: 'BASIC', verdict: 'MET', evidence: 'x' },
      ],
    });
    expect(computeScv(input({ criteria: twoOfThree, weights: weights(1, 0, 0, 0, 0) })).scvX100).toBe(6667);
  });

  it('AD-2 S_cv: the LLM cannot change the JD skills; verdicts without evidence count NOT_MET', () => {
    const base = computeScv(input()).scvX100;
    // A JD skill left out counts NOT_MET (Docker was NOT_MET already).
    const withoutDocker = criteria();
    withoutDocker.must_have = withoutDocker.must_have.filter((item) => item.skill !== 'Docker');
    expect(computeScv(input({ criteria: withoutDocker })).scvX100).toBe(base);
    // A skill the JD does not list is ignored; names match by the catalogue key.
    const extra = criteria();
    extra.must_have.push({ skill: 'Kubernetes', level_required: 'ADVANCED', verdict: 'MET', evidence: 'x' });
    extra.must_have[0]!.skill = ' java ';
    expect(computeScv(input({ criteria: extra })).scvX100).toBe(base);
    // A JD skill under the other group still counts; a skill named twice takes its lower verdict.
    const moved = criteria();
    moved.nice_to_have.push(moved.must_have.splice(1, 1)[0]!);
    expect(computeScv(input({ criteria: moved })).scvX100).toBe(base);
    const twice = criteria();
    twice.nice_to_have.push({ skill: 'SQL', level_required: 'BASIC', verdict: 'MET', evidence: 'x' });
    expect(computeScv(input({ criteria: twice })).scvX100).toBe(base);
    // MET without evidence (Invariant 5).
    const unsupported = criteria({ language: { verdict: 'MET', evidence: null } });
    expect(scoreOf(computeScv(input({ criteria: unsupported })), 'language')).toBe(0);
  });
});
