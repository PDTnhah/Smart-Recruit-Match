import { type MatchCriteria, MatchCriteriaSchema } from '../../index.js';

/** The PRD › S_cv sample output, without `education.gpa_4` (CONTEXT D41). */
const criteria = (): MatchCriteria => ({
  must_have: [
    { skill: 'Java', level_required: 'INTERMEDIATE', verdict: 'MET', evidence: "Dự án 'Quản lý thư viện' – Java Spring Boot" },
    { skill: 'SQL', level_required: 'BASIC', verdict: 'PARTIAL', evidence: "Chỉ liệt kê 'MySQL' ở mục kỹ năng" },
    { skill: 'Docker', level_required: 'BASIC', verdict: 'NOT_MET', evidence: null },
  ],
  nice_to_have: [{ skill: 'Redis', level_required: 'BASIC', verdict: 'NOT_MET', evidence: null }],
  project_relevance: { score_0_4: 3, reason: 'Hai dự án web có backend Java' },
  education: { major_match: 'EXACT' },
  language: { verdict: 'MET', evidence: 'TOEIC 650' },
});

function issuePaths(input: unknown): string[] {
  const result = MatchCriteriaSchema.safeParse(input);
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
