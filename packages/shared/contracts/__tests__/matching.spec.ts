import { type MatchCriteria, MatchCriteriaSchema, type MatchSkillVerdict, MatchSkillVerdictSchema } from '../../index.js';

/** The PRD › S_cv sample output, without `education.gpa_4` (CONTEXT D41), with the US-3.5 fields. */
const criteria = (): MatchCriteria => ({
  must_have: [
    {
      skill: 'Java',
      level_required: 'INTERMEDIATE',
      verdict: 'MET',
      evidence: "Dự án 'Quản lý thư viện' – Java, Spring Boot",
      match_kind: 'EXACT',
      tier: 3,
      via: null,
      sources: [
        { section: 'PROJECT', index: 0, text: 'Java, Spring Boot' },
        { section: 'PROJECT', index: 1, text: 'Java' },
      ],
    },
    {
      skill: 'SQL',
      level_required: 'BASIC',
      verdict: 'PARTIAL',
      evidence: 'MySQL',
      match_kind: 'IMPLIED',
      tier: 1,
      via: 'MySQL',
      sources: [{ section: 'SKILLS_LIST', index: 2, text: 'MySQL' }],
    },
    none('Docker'),
  ],
  nice_to_have: [none('Redis')],
  project_relevance: { score_0_4: 3, reason: 'Hai dự án web có backend Java' },
  education: { major_match: 'EXACT' },
  language: { verdict: 'MET', evidence: 'TOEIC 650' },
});

function none(skill: string): MatchSkillVerdict {
  return { skill, level_required: 'BASIC', verdict: 'NOT_MET', evidence: null, match_kind: 'NONE', tier: 0, via: null, sources: [] };
}

function issuePaths(input: unknown): string[] {
  const result = MatchCriteriaSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

function verdictIssues(change: Partial<Record<keyof MatchSkillVerdict, unknown>>): string[] {
  const result = MatchSkillVerdictSchema.safeParse({ ...criteria().must_have[0], ...change });
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('GĐ3 AD-2 MatchCriteria: per-criterion verdicts, code computes S_cv (US-3.1)', () => {
  it('GĐ3 accepts the PRD sample output; language is null when the JD requires none', () => {
    expect(MatchCriteriaSchema.parse(criteria())).toEqual(criteria());
    expect(MatchCriteriaSchema.safeParse({ ...criteria(), language: null }).success).toBe(true);
  });

  it('Invariant 5: MET and PARTIAL without evidence are rejected, NOT_MET may have none', () => {
    const input = criteria();
    input.must_have[0]!.evidence = null;
    input.must_have[1]!.evidence = null;
    input.language = { verdict: 'PARTIAL', evidence: null };
    expect(issuePaths(input)).toEqual(['must_have.0.evidence', 'must_have.1.evidence', 'language.evidence']);
  });

  it('LESSONS §10 the evidence error shows while another field of the item is invalid', () => {
    const input = criteria();
    Object.assign(input.must_have[0]!, { skill: '  ', evidence: null });
    expect(issuePaths(input)).toEqual(['must_have.0.skill', 'must_have.0.evidence']);
  });

  it('D41 education carries no GPA and unknown fields are rejected', () => {
    expect(issuePaths({ ...criteria(), education: { major_match: 'EXACT', gpa_4: 3.2 } })).toEqual(['education']);
    expect(issuePaths({ ...criteria(), total_score: 80 })).toEqual(['']);
  });

  it('GĐ3 project score is an integer 0..4 and verdicts are enum codes', () => {
    const input = criteria();
    input.project_relevance.score_0_4 = 5;
    expect(issuePaths(input)).toEqual(['project_relevance.score_0_4']);
    expect(issuePaths({ ...criteria(), project_relevance: { score_0_4: 2.5, reason: 'x' } })).toEqual([
      'project_relevance.score_0_4',
    ]);
    expect(issuePaths({ ...criteria(), language: { verdict: 'met', evidence: 'TOEIC 650' } })).toEqual([
      'language.verdict',
    ]);
  });
});

describe('GĐ3 FR-40 skill verdict carries match kind, tier and sources (US-3.5 AC-12)', () => {
  it('FR-40 NOT_MET ⇔ NONE: a met skill needs a match kind, an unmet one cannot have one', () => {
    expect(verdictIssues({ match_kind: 'NONE', tier: 0, sources: [] })).toEqual(['match_kind']);
    const docker = { ...none('Docker'), match_kind: 'FAMILY', tier: 2, via: 'Podman' };
    expect(MatchSkillVerdictSchema.safeParse(docker).error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'match_kind',
      'sources',
    ]);
  });

  it('FR-40 NONE ⇔ tier 0 and no via; NONE lists no source', () => {
    expect(verdictIssues({ tier: 0 })).toEqual(['tier']);
    const unmet = (change: Partial<MatchSkillVerdict>) =>
      MatchSkillVerdictSchema.safeParse({ ...none('Docker'), ...change }).error?.issues.map((issue) => issue.path.join('.'));
    expect(unmet({ tier: 1 })).toEqual(['tier']);
    expect(unmet({ via: 'Podman' })).toEqual(['via']);
    expect(unmet({ sources: [{ section: 'SKILLS_LIST', index: 0, text: 'Docker' }] })).toEqual(['sources']);
  });

  it('FR-40 MET and PARTIAL rest on at least one CV entry', () => {
    expect(verdictIssues({ sources: [] })).toEqual(['sources']);
    expect(verdictIssues({ verdict: 'PARTIAL', sources: [] })).toEqual(['sources']);
  });

  it('FR-40 IMPLIED and FAMILY name the skill they go through; EXACT does not; FAMILY gives PARTIAL only', () => {
    expect(verdictIssues({ via: 'Spring Boot' })).toEqual(['via']);
    expect(verdictIssues({ match_kind: 'IMPLIED' })).toEqual(['via']);
    expect(verdictIssues({ verdict: 'PARTIAL', match_kind: 'FAMILY', via: 'Kotlin' })).toEqual([]);
    expect(verdictIssues({ match_kind: 'FAMILY', via: 'Kotlin' })).toEqual(['verdict']);
  });

  it('FR-40 tier is an integer 0..4; at most 10 sources, each with a section, an index and CV text', () => {
    expect(verdictIssues({ tier: 5 })).toEqual(['tier']);
    expect(verdictIssues({ tier: 2.5 })).toEqual(['tier']);
    const source = { section: 'PROJECT', index: 0, text: 'Java' };
    expect(verdictIssues({ sources: Array.from({ length: 11 }, () => source) })).toEqual(['sources']);
    expect(verdictIssues({ sources: [{ ...source, section: 'EDUCATION' }] })).toEqual(['sources.0.section']);
    expect(verdictIssues({ sources: [{ ...source, index: -1 }] })).toEqual(['sources.0.index']);
    expect(verdictIssues({ sources: [{ ...source, text: ' ' }] })).toEqual(['sources.0.text']);
  });

  it('LESSONS §10 the match error shows while another field of the item is invalid', () => {
    expect(verdictIssues({ skill: ' ', match_kind: 'NONE', tier: 0, sources: [] })).toEqual(['skill', 'match_kind']);
    expect(verdictIssues({ evidence: null, via: 'Spring Boot' })).toEqual(['evidence', 'via']);
    expect(MatchSkillVerdictSchema.safeParse(undefined).success).toBe(false);
  });
});
