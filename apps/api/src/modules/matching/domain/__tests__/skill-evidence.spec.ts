import { type CvProfileMasked, skillMatchKey } from '@srm/shared';
import { buildSkillEvidence, evidenceOfNewSkill, evidenceOfSkill, type SkillMention } from '../skill-evidence.js';
import { certificate, experience, listed, profile, project } from './fixtures/profiles.js';
import { idOf, INDEX } from './fixtures/taxonomy.js';

/** `intake_end` of the campaign: July 2026 in Vietnam. */
const INTAKE_END = new Date('2026-07-15T00:00:00Z');

const evidenceIn = (cv: CvProfileMasked) => buildSkillEvidence(cv, INDEX, INTAKE_END);

/** Own mentions of a catalogue skill, in the order found. */
const mentionsOf = (cv: CvProfileMasked, name: string): readonly SkillMention[] =>
  evidenceIn(cv).bySkillId.get(idOf(name)) ?? [];

/** Names of the catalogue skills `text` shows when it is a project description. */
const skillsIn = (text: string): string[] =>
  [...evidenceIn(profile({ projects: [project({ description: text })] })).bySkillId.keys()].map(
    (id) => INDEX.byId.get(id)!.canonicalName,
  );

const tierIn = (cv: CvProfileMasked, name: string) => evidenceOfSkill(evidenceIn(cv), INDEX, idOf(name)).tier;

describe('GĐ3 FR-40 evidence sources by section; short and common keys not scanned in free text (US-3.5 AC-2, AC-3)', () => {
  const cv = profile({
    skills: [listed('java', 'Java'), listed('Bun', null), listed('Làm việc nhóm', 'Teamwork')],
    projects: [
      project({
        name: 'Quản lý thư viện',
        technologies: ['Spring Boot', 'MySQL', 'Go', 'Bun'],
        description: 'Viết dịch vụ bằng Golang, triển khai trên AWS.',
      }),
    ],
    experience: [
      experience({
        organization: 'FPT Software',
        position: 'Backend Intern',
        description: 'Phát triển API bằng Java và Spring Boot; đóng gói bằng Docker.',
      }),
    ],
    certificates: [certificate('AWS Certified Cloud Practitioner')],
  });

  it('FR-40 each section gives one mention per entry, with the words as the CV writes them', () => {
    const evidence = evidenceIn(cv);
    const named = (name: string) => evidence.bySkillId.get(idOf(name));
    expect(named('Java')).toEqual([
      { section: 'SKILLS_LIST', index: 0, phrases: ['java'] },
      { section: 'EXPERIENCE', index: 0, phrases: ['Java'] },
    ]);
    expect(named('Spring Boot')).toEqual([
      { section: 'PROJECT', index: 0, phrases: ['Spring Boot'] },
      { section: 'EXPERIENCE', index: 0, phrases: ['Spring Boot'] },
    ]);
    expect(named('Go')).toEqual([{ section: 'PROJECT', index: 0, phrases: ['Go', 'Golang'] }]);
    expect(named('AWS')).toEqual([
      { section: 'PROJECT', index: 0, phrases: ['AWS'] },
      { section: 'CERTIFICATE', index: 0, phrases: ['AWS'] },
    ]);
    expect(named('Docker')).toEqual([{ section: 'EXPERIENCE', index: 0, phrases: ['Docker'] }]);
    expect(named('Teamwork')).toEqual([{ section: 'SKILLS_LIST', index: 2, phrases: ['Làm việc nhóm'] }]);
    expect(evidence.byNewKey.get('bun')).toEqual([
      { section: 'SKILLS_LIST', index: 1, phrases: ['Bun'] },
      { section: 'PROJECT', index: 0, phrases: ['Bun'] },
    ]);
    expect(evidence.entryTitles).toEqual({
      PROJECT: ['Quản lý thư viện'],
      EXPERIENCE: ['FPT Software'],
      CERTIFICATE: ['AWS Certified Cloud Practitioner'],
    });
  });

  it('FR-40 the skills list maps by catalogue name, then by the name as written; a new skill keeps its key', () => {
    const evidence = evidenceIn(profile({ skills: [listed('Postgres', 'PostgreSQL'), listed('Golang', null)] }));
    expect(evidence.bySkillId.get(idOf('PostgreSQL'))).toEqual([{ section: 'SKILLS_LIST', index: 0, phrases: ['Postgres'] }]);
    // Golang was NEW when the CV was parsed; the catalogue knows it now as an alias of Go.
    expect(evidence.bySkillId.get(idOf('Go'))).toEqual([{ section: 'SKILLS_LIST', index: 1, phrases: ['Golang'] }]);
    expect(evidence.byNewKey.size).toBe(0);
  });

  it('FR-40 a listed name the catalogue does not know keeps its key, though mapped to a catalogue skill', () => {
    const evidence = evidenceIn(profile({ skills: [listed('Spring MVC', 'Spring Framework')] }));
    const mention = { section: 'SKILLS_LIST', index: 0, phrases: ['Spring MVC'] };
    expect(evidence.bySkillId.get(idOf('Spring Framework'))).toEqual([mention]);
    expect([...evidence.byNewKey]).toEqual([['springmvc', [mention]]]);
  });

  it('AC-3 free text: short keys, everyday words and soft skills do not match', () => {
    expect(skillsIn('Go to market cho sản phẩm mới')).toEqual([]);
    expect(skillsIn('Học kỳ Spring 2024 tại trường')).toEqual([]);
    expect(skillsIn('Dùng Excel, Word và Teams để báo cáo')).toEqual([]);
    expect(skillsIn('Viết bằng C# và R, có làm việc nhóm')).toEqual([]);
    expect(skillsIn('Phân tích bằng Microsoft Excel; tự học Golang')).toEqual(['Microsoft Excel', 'Go']);
    expect(skillsIn('Xây dựng chức năng thống kê doanh thu theo tháng')).toEqual([]);
  });

  it('AC-3 free text: no n-gram spans the end of a sentence or a line', () => {
    expect(skillsIn('Viết bằng Java. Script kiểm thử chạy hằng đêm')).toEqual(['Java']);
    expect(skillsIn('Viết bằng Java\nScript kiểm thử chạy hằng đêm')).toEqual(['Java']);
    expect(skillsIn('Frontend bằng Java Script thuần')).toEqual(['JavaScript']);
  });

  it('AC-3 free text: a Vietnamese name of seven words matches', () => {
    expect(skillsIn('Áp dụng cấu trúc dữ liệu và giải thuật để tối ưu truy vấn')).toEqual(['Data Structures and Algorithms']);
  });

  it('AC-3 free text: the longest n-gram wins and n-grams do not overlap', () => {
    expect(skillsIn('Ứng dụng React Native cho cửa hàng')).toEqual(['React Native']);
    expect(skillsIn('Frontend React, backend Spring Boot')).toEqual(['React', 'Spring Boot']);
    expect(skillsIn('Triển khai trên Amazon Web Services')).toEqual(['AWS']);
  });

  it('AC-3 free text: separators inside a name are kept, punctuation between names splits', () => {
    expect(skillsIn('API bằng Node.js, giao diện ReactJS')).toEqual(['Node.js', 'React']);
    expect(skillsIn('Java/Spring Boot, MySQL và PostgreSQL')).toEqual(['Java', 'Spring Boot', 'MySQL', 'PostgreSQL']);
    expect(skillsIn('Thư viện C++ (Kotlin binding)')).toEqual(['C++', 'Kotlin']);
    expect(skillsIn('Java, Script')).toEqual(['Java']);
  });

  it('AC-3 technologies match short keys and everyday words, as a whole or by n-grams', () => {
    const cv = profile({ projects: [project({ technologies: ['C#', 'R', 'Spring', 'Excel', 'Go', 'Java/Hibernate', 'Teamwork'] })] });
    const names = [...evidenceIn(cv).bySkillId.keys()].map((id) => INDEX.byId.get(id)!.canonicalName);
    expect(names).toEqual(['C#', 'R', 'Spring Framework', 'Microsoft Excel', 'Go', 'Java', 'Hibernate']);
    expect(evidenceIn(cv).byNewKey.get(skillMatchKey('Java/Hibernate'))).toEqual([
      { section: 'PROJECT', index: 0, phrases: ['Java/Hibernate'] },
    ]);
  });

  it('FR-40 project name and role, experience position and certificate name are scanned too', () => {
    const cv = profile({
      projects: [project({ name: 'Ứng dụng Kotlin', role: 'Lập trình viên Java' })],
      experience: [experience({ position: 'Thực tập sinh Docker' })],
      certificates: [certificate('Oracle Certified Java Programmer')],
    });
    expect(mentionsOf(cv, 'Kotlin')).toEqual([{ section: 'PROJECT', index: 0, phrases: ['Kotlin'] }]);
    expect(mentionsOf(cv, 'Java')).toEqual([
      { section: 'PROJECT', index: 0, phrases: ['Java'] },
      { section: 'CERTIFICATE', index: 0, phrases: ['Java'] },
    ]);
    expect(mentionsOf(cv, 'Docker')).toEqual([{ section: 'EXPERIENCE', index: 0, phrases: ['Docker'] }]);
    // "Oracle" is an everyday key: a Java certificate is no source for Oracle Database.
    expect(mentionsOf(cv, 'Oracle Database')).toEqual([]);
  });
});

describe('GĐ3 FR-40 tiers T0–T4 and implication closure (US-3.5 AC-4)', () => {
  const javaProject = (name = 'Dự án Java') => project({ name: 'Đồ án', technologies: ['Java'], description: name });
  const javaJob = (start: string | null, end: string | null) =>
    experience({ description: 'Phát triển backend bằng Java', start, end });

  it.each([
    ['not mentioned', profile({ skills: [listed('Kotlin')] }), 0],
    ['only listed', profile({ skills: [listed('Java')] }), 1],
    ['one project', profile({ skills: [listed('Java')], projects: [javaProject()] }), 2],
    ['one certificate', profile({ certificates: [certificate('Oracle Certified Java Programmer')] }), 2],
    [
      'two certificates (certificates stop at T2)',
      profile({ certificates: [certificate('Java SE 8 Programmer'), certificate('Java SE 11 Developer')] }),
      2,
    ],
    ['one 3-month experience', profile({ experience: [javaJob('01/2024', '03/2024')] }), 2],
    ['an experience with unreadable dates is still a source', profile({ experience: [javaJob('mùa hè', null)] }), 2],
    ['two projects', profile({ projects: [javaProject(), javaProject()] }), 3],
    ['a project and an experience', profile({ projects: [javaProject()], experience: [javaJob(null, null)] }), 3],
    [
      'three projects over 14 months (project dates are not read)',
      profile({
        projects: [
          { ...javaProject(), start: '01/2024', end: '06/2024' },
          { ...javaProject(), start: '07/2024', end: '12/2024' },
          { ...javaProject(), start: '01/2025', end: '02/2025' },
        ],
      }),
      3,
    ],
    ['one 6-month experience', profile({ experience: [javaJob('01/2024', '06/2024')] }), 4],
    ['an experience since 02/2026 until now', profile({ experience: [javaJob('02/2026', 'Hiện tại')] }), 4],
    [
      'two experiences overlapping into 6 months',
      profile({ experience: [javaJob('01/2024', '04/2024'), javaJob('03/2024', '06/2024')] }),
      4,
    ],
    [
      'two experiences overlapping into 5 months',
      profile({ experience: [javaJob('01/2024', '03/2024'), javaJob('03/2024', '05/2024')] }),
      3,
    ],
  ])('FR-40 Java %s', (_case, cv, tier) => {
    expect(tierIn(cv, 'Java')).toBe(tier);
  });

  it('FR-40 one CV entry is one source however often it names the skill', () => {
    const cv = profile({
      projects: [project({ name: 'Java Web', technologies: ['Java'], description: 'Java backend, Java frontend' })],
    });
    expect(mentionsOf(cv, 'Java')).toEqual([{ section: 'PROJECT', index: 0, phrases: ['Java'] }]);
    expect(tierIn(cv, 'Java')).toBe(2);
  });

  it('FR-40 a skill counts the sources of every skill implying it, merged by CV entry', () => {
    const springBoot = project({ name: 'Thư viện', technologies: ['Spring Boot'] });
    const hibernate = project({ name: 'Bán hàng', technologies: ['Hibernate'] });

    const implied = evidenceOfSkill(evidenceIn(profile({ projects: [springBoot] })), INDEX, idOf('Java'));
    expect(implied).toEqual({ mentions: [{ section: 'PROJECT', index: 0, phrases: ['Spring Boot'] }], tier: 2, own: false });

    // Through Spring Framework too: the closure, not just the direct edge.
    expect(tierIn(profile({ projects: [project({ technologies: ['Spring'] })] }), 'Java')).toBe(2);
    // Two projects through two different skills reach T3; both in one project stay one source.
    expect(tierIn(profile({ projects: [springBoot, hibernate] }), 'Java')).toBe(3);
    const both = profile({ projects: [project({ technologies: ['Java', 'Spring Boot', 'Hibernate'] })] });
    expect(evidenceOfSkill(evidenceIn(both), INDEX, idOf('Java'))).toEqual({
      mentions: [{ section: 'PROJECT', index: 0, phrases: ['Java', 'Spring Boot', 'Hibernate'] }],
      tier: 2,
      own: true,
    });
    // An implication runs one way only.
    expect(tierIn(profile({ projects: [project({ technologies: ['Java'] })] }), 'Spring Boot')).toBe(0);
  });

  it('FR-40 merged mentions run experience, projects, certificates, then the skills list', () => {
    const cv = profile({
      skills: [listed('MySQL')],
      projects: [project(), project({ technologies: ['SQL'] })],
      experience: [experience({ description: 'Tối ưu truy vấn PostgreSQL' })],
      certificates: [certificate('MySQL Database Administrator')],
    });
    const sql = evidenceOfSkill(evidenceIn(cv), INDEX, idOf('SQL'));
    expect(sql.mentions.map(({ section, index }) => `${section}:${index}`)).toEqual([
      'EXPERIENCE:0',
      'PROJECT:1',
      'CERTIFICATE:0',
      'SKILLS_LIST:0',
    ]);
    expect(sql).toMatchObject({ tier: 3, own: true });
  });

  it('FR-40 a skill outside the catalogue matches by key through new skills and technologies only', () => {
    const cv = profile({
      skills: [listed('Bun', null)],
      projects: [project({ technologies: ['bun'], description: 'Chạy bằng Bun' }), project({ technologies: ['Deno'] })],
    });
    const evidence = evidenceIn(cv);
    expect(evidenceOfNewSkill(evidence, 'bun')).toEqual({
      mentions: [
        { section: 'PROJECT', index: 0, phrases: ['bun'] },
        { section: 'SKILLS_LIST', index: 0, phrases: ['Bun'] },
      ],
      tier: 2,
      own: true,
    });
    expect(evidenceOfNewSkill(evidence, 'elysia')).toEqual({ mentions: [], tier: 0, own: false });
  });

  it('FR-40 soft skills get T1 from the skills list; free text and technologies give them nothing', () => {
    // Signals do (soft-skill-signals.spec.ts); "làm việc nhóm" is a claim, not one.
    const cv = profile({
      skills: [listed('Teamwork')],
      projects: [project({ technologies: ['Teamwork'], description: 'Làm việc nhóm, teamwork tốt' })],
    });
    expect(evidenceOfSkill(evidenceIn(cv), INDEX, idOf('Teamwork'))).toEqual({
      mentions: [{ section: 'SKILLS_LIST', index: 0, phrases: ['Teamwork'] }],
      tier: 1,
      own: true,
    });
  });
});
