import { type CvProfileMasked, SOFT_SKILL_FAMILIES } from '@srm/shared';
import { buildSkillEvidence, evidenceOfSkill } from '../skill-evidence.js';
import { SOFT_SKILL_SIGNALS, SOFT_SKILL_SIGNALS_VERSION, softSkillSignals } from '../soft-skill-signals.js';
import { certificate, experience, listed, profile, project } from './fixtures/profiles.js';
import { idOf, INDEX } from './fixtures/taxonomy.js';

const INTAKE_END = new Date('2026-07-15T00:00:00Z');

/** Signals by competency: the entry and the words of each. */
const signalsIn = (cv: CvProfileMasked) =>
  Object.fromEntries(buildSkillEvidence(cv, INDEX, INTAKE_END).bySoftSkillFamily);

/** Competencies `text` signals as a project description, and as an experience description. */
const familiesIn = (text: string) => ({
  project: [...new Set(softSkillSignals(profile({ projects: [project({ description: text })] })).map((s) => s.family))],
  experience: [
    ...new Set(softSkillSignals(profile({ experience: [experience({ description: text })] })).map((s) => s.family)),
  ],
});

const evidenceOf = (cv: CvProfileMasked, name: string) =>
  evidenceOfSkill(buildSkillEvidence(cv, INDEX, INTAKE_END), INDEX, idOf(name));

describe('GĐ3 FR-40 soft skills: claimed T1, signals from distinct entries (US-3.5 AC-8)', () => {
  it('FR-40 the signal table is versioned and covers every standard competency', () => {
    expect(SOFT_SKILL_SIGNALS_VERSION).toBe('soft-skill-signals/v1');
    expect(new Set(SOFT_SKILL_SIGNALS.map((rule) => rule.family))).toEqual(new Set(SOFT_SKILL_FAMILIES));
  });

  it('FR-40 role, position, description and certificate give signals, with the words as the CV writes them', () => {
    const cv = profile({
      projects: [
        project({ role: 'Trưởng nhóm', description: 'Dự thi Hackathon 2024 cùng nhóm 4 người; tự học Flutter.' }),
      ],
      experience: [
        experience({
          position: 'Thực tập sinh QA',
          description: 'Phụ trách kiểm thử API, giao tiếp trực tiếp với khách hàng.',
        }),
      ],
      certificates: [certificate('Chứng chỉ Kỹ năng thuyết trình'), certificate('Leadership Essentials')],
    });
    expect(signalsIn(cv)).toEqual({
      LEADERSHIP: [
        { section: 'PROJECT', index: 0, phrases: ['Trưởng nhóm'] },
        { section: 'CERTIFICATE', index: 1, phrases: ['Leadership'] },
      ],
      PROBLEM_SOLVING: [{ section: 'PROJECT', index: 0, phrases: ['Hackathon'] }],
      TEAMWORK: [{ section: 'PROJECT', index: 0, phrases: ['nhóm 4 người'] }],
      SELF_LEARNING: [{ section: 'PROJECT', index: 0, phrases: ['tự học'] }],
      ATTENTION_TO_DETAIL: [{ section: 'EXPERIENCE', index: 0, phrases: ['QA', 'kiểm thử'] }],
      RESPONSIBILITY: [{ section: 'EXPERIENCE', index: 0, phrases: ['Phụ trách'] }],
      COMMUNICATION: [{ section: 'EXPERIENCE', index: 0, phrases: ['giao tiếp trực tiếp với khách hàng'] }],
      PRESENTATION: [{ section: 'CERTIFICATE', index: 0, phrases: ['thuyết trình'] }],
    });
  });

  it.each([
    ['Làm việc với trưởng nhóm để thống nhất yêu cầu'],
    ['Báo cáo cho team lead hằng tuần'],
    ['Hỗ trợ trưởng nhóm soạn tài liệu thiết kế'],
    ['Under the tech lead, built the payment module'],
    ['Ứng dụng tự học tiếng Anh cho học sinh'],
    ['Website hackathon của khoa'],
    ['Phát triển giao diện thích ứng cho thiết bị di động'],
  ])('AC-8 %j: a keyword about someone else or about the product is no signal', (text) => {
    expect(familiesIn(text)).toEqual({ project: [], experience: [] });
  });

  it('AC-8 the role of someone else in a title is no signal; the student’s own is', () => {
    const cv = profile({
      experience: [experience({ position: 'Trợ lý trưởng phòng' }), experience({ position: 'Team Leader' })],
    });
    expect(signalsIn(cv)).toEqual({ LEADERSHIP: [{ section: 'EXPERIENCE', index: 1, phrases: ['Leader'] }] });
  });

  it('AC-8 phrases that may name a feature are looked for in work only, not in project descriptions', () => {
    expect(familiesIn('Hỗ trợ khách hàng qua kênh chat')).toEqual({ project: [], experience: ['COMMUNICATION'] });
    expect(familiesIn('Xử lý sự cố hệ thống thanh toán')).toEqual({ project: [], experience: ['PROBLEM_SOLVING'] });
  });

  it('AC-8 a text in decomposed form is read in NFC', () => {
    const cv = profile({ projects: [project({ role: 'Trưởng nhóm'.normalize('NFD') })] });
    expect(signalsIn(cv)).toEqual({ LEADERSHIP: [{ section: 'PROJECT', index: 0, phrases: ['Trưởng nhóm'] }] });
  });

  it('AC-8 signals repeated in one entry count once; tiers T2, T3, T4 by distinct entries', () => {
    const leading = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        project({ name: `Đồ án ${i + 1}`, role: 'Trưởng nhóm', description: 'Dẫn dắt nhóm, kèm cặp hai bạn mới.' }),
      );
    expect(evidenceOf(profile({ projects: leading(1) }), 'Leadership')).toEqual({
      mentions: [{ section: 'PROJECT', index: 0, phrases: ['Trưởng nhóm', 'Dẫn dắt nhóm', 'kèm cặp'] }],
      tier: 2,
      own: true,
    });
    expect(evidenceOf(profile({ projects: leading(2) }), 'Leadership').tier).toBe(3);
    expect(evidenceOf(profile({ projects: leading(3) }), 'Leadership').tier).toBe(4);
    expect(evidenceOf(profile({ projects: leading(5) }), 'Leadership').tier).toBe(4);
    // Projects, experience and certificates are entries alike.
    const mixed = profile({
      projects: leading(1),
      experience: [experience({ position: 'Chủ nhiệm CLB Tin học' })],
      certificates: [certificate('Leadership Essentials')],
    });
    expect(evidenceOf(mixed, 'Leadership').tier).toBe(4);
  });

  it('AC-8 a signal counts for every soft skill of its competency', () => {
    const cv = profile({ projects: [project({ role: 'Trưởng nhóm' })] });
    expect(evidenceOf(cv, 'People Management')).toEqual(evidenceOf(cv, 'Leadership'));
    expect(evidenceOf(cv, 'Teamwork').tier).toBe(0);
  });

  it('AC-8 a claimed soft skill is T1; "làm việc nhóm" in a description is no source', () => {
    const cv = profile({
      skills: [listed('Làm việc nhóm', 'Teamwork'), listed('Lãnh đạo', 'Leadership')],
      projects: [project({ description: 'Làm việc nhóm hiệu quả, có tinh thần lãnh đạo.' })],
    });
    expect(evidenceOf(cv, 'Teamwork')).toEqual({
      mentions: [{ section: 'SKILLS_LIST', index: 0, phrases: ['Làm việc nhóm'] }],
      tier: 1,
      own: true,
    });
    expect(evidenceOf(cv, 'Leadership').tier).toBe(1);
    expect(evidenceOf(profile(), 'Leadership').tier).toBe(0);
  });
});
