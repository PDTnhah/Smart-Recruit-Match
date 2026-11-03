import {
  CampaignConfigSchema,
  type CvProfileMasked,
  type JdRequirements,
  type JdSkillRequirement,
  type MatchSkillVerdict,
  MatchSkillVerdictSchema,
  scvWeightsOf,
  type SkillLevel,
} from '@srm/shared';
import { scoreLanguage } from '../language-score.js';
import { majorMatch } from '../major-match.js';
import { computeScv } from '../scv.js';
import { buildSkillEvidence } from '../skill-evidence.js';
import { matchSkills } from '../skill-match.js';
import { certificate, experience, listed, profile, project } from './fixtures/profiles.js';
import { INDEX } from './fixtures/taxonomy.js';

const INTAKE_END = new Date('2026-07-15T00:00:00Z');

const req = (skill: string, level: SkillLevel = 'BASIC', weight = 1): JdSkillRequirement => ({ skill, level, weight });

/** The verdict on one JD skill; every verdict must pass the contract (AC-12). */
function verdictFor(cv: CvProfileMasked, requirement: JdSkillRequirement): MatchSkillVerdict {
  const evidence = buildSkillEvidence(cv, INDEX, INTAKE_END);
  const [verdict] = matchSkills({ must_have: [requirement], nice_to_have: [] }, evidence, INDEX).must_have;
  expect(MatchSkillVerdictSchema.parse(verdict)).toEqual(verdict);
  return verdict!;
}

const using = (...technologies: string[][]) =>
  technologies.map((list, i) => project({ name: `Đồ án ${i + 1}`, technologies: list }));

const NONE = { verdict: 'NOT_MET', match_kind: 'NONE', tier: 0, via: null, evidence: null, sources: [] };

describe('GĐ3 FR-40 exact, implied, family and none; evidence copied from CV (US-3.5 AC-5, AC-6)', () => {
  it.each<[string, CvProfileMasked, SkillLevel, string, number]>([
    ['only listed', profile({ skills: [listed('Java')] }), 'BASIC', 'PARTIAL', 1],
    ['one project', profile({ projects: using(['Java']) }), 'BASIC', 'MET', 2],
    ['one project', profile({ projects: using(['Java']) }), 'INTERMEDIATE', 'PARTIAL', 2],
    ['two projects', profile({ projects: using(['Java'], ['Java']) }), 'INTERMEDIATE', 'MET', 3],
    ['two projects', profile({ projects: using(['Java'], ['Java']) }), 'ADVANCED', 'PARTIAL', 3],
    [
      'six months of work',
      profile({ experience: [experience({ description: 'Backend Java', start: '01/2024', end: '06/2024' })] }),
      'ADVANCED',
      'MET',
      4,
    ],
  ])('AC-5 EXACT, %s, JD asks %s: %s at T%i', (_, cv, level, verdict, tier) => {
    expect(verdictFor(cv, req('Java', level))).toMatchObject({ verdict, match_kind: 'EXACT', tier, via: null });
  });

  it('AC-5 EXACT: the tier rests on the skill and the skills that imply it together', () => {
    const cv = profile({ skills: [listed('Java')], projects: using(['Spring Boot']) });
    expect(verdictFor(cv, req('Java'))).toEqual({
      skill: 'Java',
      level_required: 'BASIC',
      verdict: 'MET',
      match_kind: 'EXACT',
      tier: 2,
      via: null,
      evidence: "Dự án 'Đồ án 1' – Spring Boot; Java",
      sources: [
        { section: 'PROJECT', index: 0, text: 'Spring Boot' },
        { section: 'SKILLS_LIST', index: 0, text: 'Java' },
      ],
    });
  });

  it('AC-5 IMPLIED: a skill that implies the JD skill stands for it, through the strongest, the smallest id on a tie', () => {
    expect(verdictFor(profile({ projects: using(['Spring Boot']) }), req('Java'))).toMatchObject({
      verdict: 'MET',
      match_kind: 'IMPLIED',
      tier: 2,
      via: 'Spring Boot',
      evidence: "Dự án 'Đồ án 1' – Spring Boot",
    });
    // The JD names Spring Framework by its alias.
    expect(verdictFor(profile({ projects: using(['Spring Boot']) }), req('Spring'))).toMatchObject({
      skill: 'Spring',
      match_kind: 'IMPLIED',
      via: 'Spring Boot',
    });
    // Hibernate (T3) is stronger than Spring Boot and Spring Framework (T2); the union is T3.
    expect(
      verdictFor(profile({ projects: using(['Spring Boot'], ['Hibernate'], ['Hibernate']) }), req('Java', 'INTERMEDIATE')),
    ).toMatchObject({ verdict: 'MET', match_kind: 'IMPLIED', tier: 3, via: 'Hibernate' });
    // NestJS ⇒ TypeScript ⇒ JavaScript: TypeScript has the smaller id, but the CV names NestJS only.
    expect(verdictFor(profile({ projects: using(['NestJS']) }), req('JavaScript'))).toMatchObject({
      verdict: 'MET',
      match_kind: 'IMPLIED',
      tier: 2,
      via: 'NestJS',
      evidence: "Dự án 'Đồ án 1' – NestJS",
    });
    // All at T2: Spring Boot has the smallest id.
    const tied = profile({ projects: using(['Hibernate'], ['Spring Boot']) });
    expect(verdictFor(tied, req('Java', 'ADVANCED'))).toMatchObject({
      verdict: 'PARTIAL',
      match_kind: 'IMPLIED',
      tier: 3,
      via: 'Spring Boot',
    });
  });

  it('AC-5 FAMILY: a same-family skill at T2 or more gives PARTIAL whatever its tier; T1 gives nothing', () => {
    expect(verdictFor(profile({ projects: using(['PostgreSQL']) }), req('MySQL', 'ADVANCED'))).toEqual({
      skill: 'MySQL',
      level_required: 'ADVANCED',
      verdict: 'PARTIAL',
      match_kind: 'FAMILY',
      tier: 2,
      via: 'PostgreSQL',
      evidence: "Dự án 'Đồ án 1' – PostgreSQL",
      sources: [{ section: 'PROJECT', index: 0, text: 'PostgreSQL' }],
    });
    expect(verdictFor(profile({ projects: using(['Podman'], ['Podman']) }), req('Docker'))).toMatchObject({
      verdict: 'PARTIAL',
      match_kind: 'FAMILY',
      tier: 3,
      via: 'Podman',
    });
    expect(verdictFor(profile({ skills: [listed('PostgreSQL')] }), req('MySQL'))).toEqual({
      ...NONE,
      skill: 'MySQL',
      level_required: 'BASIC',
    });
  });

  it('AC-5 a foreign language does not stand in for another', () => {
    const cv = profile({ experience: [experience({ description: 'Trao đổi bằng tiếng Anh với đối tác' })] });
    expect(verdictFor(cv, req('English'))).toMatchObject({ verdict: 'MET', match_kind: 'EXACT', tier: 2 });
    expect(verdictFor(cv, req('Japanese'))).toMatchObject(NONE);
  });

  it('AC-5 a JD skill outside the catalogue matches the skills list and technologies by key only', () => {
    const cv = profile({ skills: [listed('Bun', null)], projects: [project({ name: 'API', technologies: ['bun'] })] });
    expect(verdictFor(cv, req('Bun'))).toEqual({
      skill: 'Bun',
      level_required: 'BASIC',
      verdict: 'MET',
      match_kind: 'EXACT',
      tier: 2,
      via: null,
      evidence: "Dự án 'API' – bun; Bun",
      sources: [
        { section: 'PROJECT', index: 0, text: 'bun' },
        { section: 'SKILLS_LIST', index: 0, text: 'Bun' },
      ],
    });
    expect(verdictFor(profile({ projects: [project({ description: 'Chạy bằng Bun' })] }), req('Bun'))).toMatchObject(NONE);
    expect(verdictFor(cv, req('Deno'))).toMatchObject(NONE);
  });

  it('AC-5 soft skills go through the same rules, tiered by signals (AC-8)', () => {
    const cv = profile({
      skills: [listed('Làm việc nhóm', 'Teamwork')],
      projects: [project({ name: 'Đặt vé xe', role: 'Trưởng nhóm', description: 'Nhóm 5 người' })],
      experience: [experience({ description: 'Phối hợp với các thành viên khác' })],
    });
    expect(verdictFor(cv, req('Teamwork', 'INTERMEDIATE'))).toEqual({
      skill: 'Teamwork',
      level_required: 'INTERMEDIATE',
      verdict: 'MET',
      match_kind: 'EXACT',
      tier: 3,
      via: null,
      evidence:
        "Kinh nghiệm 'Công ty ABC' – Phối hợp với các thành viên; Dự án 'Đặt vé xe' – Nhóm 5 người; Làm việc nhóm",
      sources: [
        { section: 'EXPERIENCE', index: 0, text: 'Phối hợp với các thành viên' },
        { section: 'PROJECT', index: 0, text: 'Nhóm 5 người' },
        { section: 'SKILLS_LIST', index: 0, text: 'Làm việc nhóm' },
      ],
    });
    expect(verdictFor(cv, req('Làm việc nhóm'))).toMatchObject({ verdict: 'MET', match_kind: 'EXACT', tier: 3 });
    expect(verdictFor(cv, req('People Management', 'INTERMEDIATE'))).toMatchObject({
      verdict: 'PARTIAL',
      match_kind: 'EXACT',
      tier: 2,
      evidence: "Dự án 'Đặt vé xe' – Trưởng nhóm",
    });
  });

  it('AC-6 sources: strongest first, at most 10; evidence within 1000 characters, cut between entries', () => {
    const name = (i: number) => `Đồ án ${String(i).padStart(2, '0')} ${'a'.repeat(190)}`;
    const cv = profile({
      skills: [listed('Java')],
      projects: Array.from({ length: 12 }, (_, i) => project({ name: name(i), technologies: ['Java'] })),
      experience: [experience({ description: 'Viết API bằng Java' })],
      certificates: [certificate('Oracle Certified Java Programmer')],
    });
    const verdict = verdictFor(cv, req('Java', 'ADVANCED'));
    expect(verdict.sources).toEqual([
      { section: 'EXPERIENCE', index: 0, text: 'Java' },
      ...Array.from({ length: 9 }, (_, i) => ({ section: 'PROJECT', index: i, text: 'Java' })),
    ]);
    const parts = ["Kinh nghiệm 'Công ty ABC' – Java", ...[0, 1, 2, 3].map((i) => `Dự án '${name(i)}' – Java`)];
    expect(verdict.evidence).toBe(parts.join('; '));
    expect(`${verdict.evidence}; Dự án '${name(4)}' – Java`.length).toBeGreaterThan(1000);
  });

  it('AC-6 the words of one entry are cut between phrases within 1000 characters', () => {
    // 30 ways of writing Java, 64 to 93 characters each: the key drops the dots.
    const technologies = Array.from({ length: 30 }, (_, i) => `J${'.'.repeat(60 + i)}ava`);
    const verdict = verdictFor(profile({ projects: [project({ name: 'X', technologies })] }), req('Java'));
    const text = verdict.sources[0]!.text;
    expect(text.length).toBeLessThanOrEqual(1000);
    expect(text).toBe(technologies.slice(0, text.split(', ').length).join(', '));
    expect(`${text}, ${technologies[text.split(', ').length]}`.length).toBeGreaterThan(1000);
    expect(verdict.evidence!.length).toBeLessThanOrEqual(1000);
    const shown = verdict.evidence!.split(', ').length;
    expect(verdict.evidence).toBe(`Dự án 'X' – ${technologies.slice(0, shown).join(', ')}`);
  });
});

describe('GĐ3 PRD sample: code verdicts feed computeScv to 58.80 (US-3.5 AC-7, US-3.6)', () => {
  const requirements: JdRequirements = {
    must_have: [req('Java', 'INTERMEDIATE'), req('SQL'), req('Docker')],
    nice_to_have: [req('Redis')],
    hard_conditions: { majors: [], min_study_year: null, min_gpa: null, required_languages: ['Tiếng Anh (TOEIC 500)'] },
    preferred_languages: [],
  };
  const cv = profile({
    skills: [listed('MySQL')],
    projects: [
      project({ name: 'Quản lý thư viện', technologies: ['Java', 'Spring Boot'] }),
      project({ name: 'Đặt vé xe', technologies: ['Java'] }),
    ],
  });
  const verdicts = matchSkills(requirements, buildSkillEvidence(cv, INDEX, INTAKE_END), INDEX);

  it('GĐ3 PRD sample: Java MET EXACT T3, SQL PARTIAL IMPLIED T1 via MySQL, Docker and Redis NOT_MET', () => {
    expect(verdicts).toEqual({
      must_have: [
        {
          skill: 'Java',
          level_required: 'INTERMEDIATE',
          verdict: 'MET',
          match_kind: 'EXACT',
          tier: 3,
          via: null,
          evidence: "Dự án 'Quản lý thư viện' – Java, Spring Boot; Dự án 'Đặt vé xe' – Java",
          sources: [
            { section: 'PROJECT', index: 0, text: 'Java, Spring Boot' },
            { section: 'PROJECT', index: 1, text: 'Java' },
          ],
        },
        {
          skill: 'SQL',
          level_required: 'BASIC',
          verdict: 'PARTIAL',
          match_kind: 'IMPLIED',
          tier: 1,
          via: 'MySQL',
          evidence: 'MySQL',
          sources: [{ section: 'SKILLS_LIST', index: 0, text: 'MySQL' }],
        },
        { ...NONE, skill: 'Docker', level_required: 'BASIC' },
      ],
      nice_to_have: [{ ...NONE, skill: 'Redis', level_required: 'BASIC' }],
    });
  });

  it('GĐ3 PRD sample: with the rest of US-3.1 AC-4, S_cv is 58.80; major and language by code too', () => {
    const language = scoreLanguage(requirements, ['Tiếng Anh TOEIC 650']);
    expect(language).toEqual({
      verdict: 'MET',
      evidence: 'Tiếng Anh TOEIC 650',
      required: 'TOEIC 500 (A2)',
      held: 'TOEIC 650 (B1)',
    });
    const result = computeScv({
      requirements,
      criteria: {
        ...verdicts,
        project_relevance: { score_0_4: 3, reason: '...' },
        education: majorMatch({ majors: [], positionGroup: 'BACKEND' }, 'Kỹ thuật phần mềm'),
        language,
      },
      education: { gpa4: 3.2 },
      weights: scvWeightsOf(CampaignConfigSchema.parse({})),
    });
    expect(result.scvX100).toBe(5880);
  });
});
