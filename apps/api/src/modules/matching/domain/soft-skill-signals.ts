import type { CvProfileMasked, EvidenceSection, SkillFamily } from '@srm/shared';

// Signals of the standard soft-skill competencies in a CV (FR-40, US-3.5 AC-8, PRD › Kỹ năng mềm).
// Claiming a soft skill in the skills list gives T1 only; what the student did shows it: "trưởng
// nhóm" as a project role is a signal of leadership, a hackathon one of problem solving. A signal
// counts for its competency (family), so every soft skill of the family takes it. The table is
// versioned and stored with every match result; a change of any signal is a new version.

export const SOFT_SKILL_SIGNALS_VERSION = 'soft-skill-signals/v1';

/**
 * Where a signal is looked for: the role of a project or the position of an experience entry, the
 * description of either, the name of a certificate. A project description also says what the
 * product does, so phrases that may name a feature ("hỗ trợ khách hàng") are looked for in work only.
 */
export type SignalField = 'TITLE' | 'PROJECT_DESCRIPTION' | 'EXPERIENCE_DESCRIPTION' | 'CERTIFICATE';

export interface SignalRule {
  family: SkillFamily;
  fields: ReadonlySet<SignalField>;
  /** Whole words, case-insensitive; not global, so `test` and `exec` keep no state between calls. */
  pattern: RegExp;
  /** A match is no signal when the text before it ends so. */
  notAfter: RegExp;
}

const WORD_CHAR = String.raw`\p{L}\p{M}\p{N}`;

/** How much text before a match `notAfter` reads. */
const CONTEXT_CHARS = 40;

/** Regex sources joined as alternatives; a space in one stands for any run of white space. */
const anyOf = (sources: readonly string[]): string =>
  sources.map((source) => source.replaceAll(' ', String.raw`\s+`)).join('|');

/** Text that ends with one of `words`, maybe followed by an article or a title ("với anh", "with the"). */
const endsWith = (words: readonly string[]): RegExp =>
  new RegExp(
    `(?<![${WORD_CHAR}])(?:${anyOf(words)})\\s+(?:(?:các|những|anh|chị|thầy|cô|the|a|an|my|our|their)\\s+)?$`,
    'iu',
  );

const PRODUCT_WORDS = [
  'nền tảng',
  'trang web',
  'website',
  'web',
  'ứng dụng',
  'app',
  'hệ thống',
  'phần mềm',
  'module',
  'chức năng',
  'tính năng',
  'giao diện',
  'công cụ',
  'dành cho',
  'cho',
  'platform',
  'system',
  'application',
  'tool',
  'feature',
  'interface',
  'for',
];

/** The phrase names what the product does, not what the student did: "ứng dụng tự học". */
const PRODUCT = endsWith(PRODUCT_WORDS);

/** ...or the role of someone else: "làm việc với trưởng nhóm", "báo cáo cho team lead". */
const SOMEONE_ELSE = endsWith([
  ...PRODUCT_WORDS,
  'với',
  'của',
  'cùng',
  'hỗ trợ',
  'giúp',
  'theo',
  'dưới',
  'gặp',
  'báo cáo',
  'báo cáo lên',
  'trợ lý',
  'with',
  'under',
  'assist(?:ed|ing)?',
  'assistant(?: to)?',
  'support(?:ed|ing)?',
  'report(?:s|ed|ing)? to',
]);

const TITLE: readonly SignalField[] = ['TITLE'];
const CERTIFICATE: readonly SignalField[] = ['CERTIFICATE'];
const DESCRIPTIONS: readonly SignalField[] = ['PROJECT_DESCRIPTION', 'EXPERIENCE_DESCRIPTION'];
const ENTRIES: readonly SignalField[] = ['TITLE', ...DESCRIPTIONS];
const WORK: readonly SignalField[] = ['TITLE', 'EXPERIENCE_DESCRIPTION'];

function rule(family: SkillFamily, fields: readonly SignalField[], phrases: readonly string[], notAfter = PRODUCT): SignalRule {
  const pattern = new RegExp(`(?<![${WORD_CHAR}])(?:${anyOf(phrases)})(?![${WORD_CHAR}])`, 'iu');
  return { family, fields: new Set(fields), pattern, notAfter };
}

/** `soft-skill-signals/v1`. Longer alternatives come first, so the evidence quotes the whole phrase. */
export const SOFT_SKILL_SIGNALS: readonly SignalRule[] = [
  rule('COMMUNICATION', WORK, [
    '(?:giao tiếp|trao đổi|làm việc|tư vấn|hỗ trợ|chăm sóc|gặp gỡ|tiếp xúc)(?: trực tiếp)? (?:với |cho )?(?:các )?(?:khách hàng|đối tác)',
    'customer (?:support|service|care)',
    'communicat(?:e|ed|ing) with (?:the )?(?:clients?|customers?|stakeholders?|partners?)',
    'phiên dịch',
    'biên dịch',
    'interpreter',
    'translator',
    'dẫn chương trình',
    'tư vấn viên',
    'mc',
  ]),
  rule('COMMUNICATION', CERTIFICATE, ['giao tiếp', 'communication']),

  rule('TEAMWORK', ENTRIES, [
    String.raw`nhóm (?:gồm )?\d+ (?:người|thành viên|bạn)`,
    String.raw`team of \d+`,
    String.raw`\d+[-\s](?:person|member|people) team`,
    'phối hợp (?:với|cùng) (?:các )?(?:thành viên|bạn|đồng đội|team|nhóm|đội|bộ phận|phòng ban)',
    'collaborat(?:ed|ing) with (?:the |a )?(?:team|teammates|members|designers|developers|testers)',
  ]),
  rule('TEAMWORK', TITLE, ['thành viên (?:của |trong )?(?:nhóm|đội|team)', 'team member']),
  rule('TEAMWORK', CERTIFICATE, ['làm việc nhóm', 'teamwork']),

  rule(
    'LEADERSHIP',
    TITLE,
    [
      'trưởng nhóm',
      'nhóm trưởng',
      'trưởng ban',
      'phó ban',
      'trưởng phòng',
      'trưởng dự án',
      'lớp trưởng',
      'lớp phó',
      'đội trưởng',
      'chủ nhiệm',
      'chủ tịch',
      'bí thư',
      'leader',
      'lead',
      'president',
      'captain',
      'head',
      'manager',
    ],
    SOMEONE_ELSE,
  ),
  rule(
    'LEADERSHIP',
    DESCRIPTIONS,
    [
      'trưởng nhóm',
      'nhóm trưởng',
      'trưởng ban',
      'trưởng dự án',
      'lớp trưởng',
      'đội trưởng',
      'chủ nhiệm (?:clb|câu lạc bộ|đề tài)',
      'team lead(?:er)?',
      'tech lead',
      '(?:dẫn dắt|lãnh đạo) (?:nhóm|đội|team)',
      '(?:led|leading) (?:a |the )?(?:team|group)',
      'mentor(?:ed|ing)',
      'kèm cặp',
    ],
    SOMEONE_ELSE,
  ),
  rule('LEADERSHIP', CERTIFICATE, ['lãnh đạo', 'leadership']),

  rule('PROBLEM_SOLVING', [...ENTRIES, 'CERTIFICATE'], [
    'hackathon',
    'olympic (?:tin học|toán học|toán|informatics)',
    'icpc',
    'cuộc thi lập trình',
    'lập trình thi đấu',
    'competitive programming',
    'programming contest',
    'học sinh giỏi (?:quốc gia|cấp tỉnh|tỉnh|thành phố)',
  ]),
  rule('PROBLEM_SOLVING', WORK, ['(?:xử lý|khắc phục|giải quyết) sự cố', 'troubleshoot(?:ing|ed)?']),
  rule('PROBLEM_SOLVING', CERTIFICATE, ['giải quyết vấn đề', 'problem solving', 'olympic']),

  rule('PRESENTATION', ENTRIES, [
    'thuyết trình',
    'trình bày (?:tại|trước)',
    'báo cáo (?:tại|ở) (?:hội nghị|hội thảo|seminar|workshop)',
    'present(?:ed|ing) (?:at|to)',
    'demo (?:cho|trước) (?:khách hàng|hội đồng|ban giám khảo|giám khảo)',
  ]),
  rule('PRESENTATION', WORK, ['diễn giả', 'speaker']),
  rule('PRESENTATION', CERTIFICATE, ['thuyết trình', 'presentation', 'public speaking']),

  rule('CRITICAL_THINKING', ENTRIES, [
    'phản biện',
    'tranh biện',
    'debate',
    'nghiên cứu khoa học',
    'nckh',
    'so sánh (?:và )?đánh giá',
    'đánh giá (?:và lựa chọn )?(?:các )?(?:giải pháp|phương án)',
    'evaluat(?:e|ed|ing) (?:the )?(?:alternatives|options|trade-offs|solutions)',
  ]),
  rule('CRITICAL_THINKING', CERTIFICATE, ['tư duy phản biện', 'critical thinking', 'tranh biện', 'debate']),

  rule('SELF_LEARNING', ENTRIES, [
    'tự học',
    'tự nghiên cứu',
    'tự tìm hiểu',
    String.raw`self[-\s]taught`,
    String.raw`self[-\s]stud(?:y|ied)`,
    String.raw`self[-\s]learn(?:ing|ed)?`,
  ]),
  rule('SELF_LEARNING', CERTIFICATE, ['coursera', 'udemy', 'edx', 'tự học', String.raw`self[-\s]learning`]),

  rule('TIME_MANAGEMENT', ENTRIES, [
    'đúng (?:hạn|tiến độ|deadline)',
    'trước (?:thời hạn|hạn|deadline)',
    'on time',
    'ahead of schedule',
    'met (?:the |all )?deadlines?',
    'vừa học vừa làm',
    'quản lý (?:tiến độ|thời gian)',
    'lập kế hoạch',
  ]),
  rule('TIME_MANAGEMENT', CERTIFICATE, ['quản lý thời gian', 'time management']),

  rule('PROACTIVENESS', ENTRIES, [
    'chủ động',
    'khởi xướng',
    'đồng sáng lập',
    'sáng lập',
    'founder',
    'đề xuất (?:cải tiến|cải thiện|giải pháp|ý tưởng|tính năng|phương án)',
    'initiated',
    'proposed (?:a |an |the |new )?(?:solution|improvement|feature|idea|approach)',
  ]),
  rule('PROACTIVENESS', CERTIFICATE, ['chủ động', 'proactive']),

  rule('RESPONSIBILITY', ENTRIES, [
    'chịu trách nhiệm',
    'phụ trách',
    'responsible for',
    'in charge of',
    'tình nguyện viên',
    'volunteer(?:ed|ing)?',
    'thủ quỹ',
    'treasurer',
  ]),
  rule('RESPONSIBILITY', CERTIFICATE, ['tình nguyện', 'volunteer', 'trách nhiệm', 'responsibility']),

  rule('ADAPTABILITY', ENTRIES, [
    'thích nghi',
    'thích ứng',
    'nhanh chóng (?:làm quen|tiếp cận|nắm bắt|học)',
    'adapt(?:ed|ing) to',
    'quickly (?:learned|picked up|adapted)',
    'làm việc (?:từ xa|remote)',
    'work(?:ed|ing)? remotely',
    'remote (?:team|internship|work)',
    'đa văn hóa',
    'multicultural',
    'trao đổi sinh viên',
    'exchange (?:student|program)',
  ]),
  rule('ADAPTABILITY', CERTIFICATE, ['thích nghi', 'adaptability']),

  rule('ATTENTION_TO_DETAIL', ENTRIES, [
    'kiểm thử',
    'test cases?',
    'tester',
    'quality assurance',
    'qa',
    'qc',
    'code review',
    'review code',
    'rà soát',
    'đối soát',
    'hiệu đính',
    'proofread(?:ing)?',
    'viết tài liệu',
    'documentation',
  ]),
];

/** One signal in a CV: the competency, the entry and the words as the CV writes them. */
export interface SoftSkillSignal {
  family: SkillFamily;
  section: Exclude<EvidenceSection, 'SKILLS_LIST'>;
  index: number;
  phrase: string;
}

/** Every match of `rule` in `text` that the words before it do not rule out. */
function phrasesOf(rule: SignalRule, text: string): string[] {
  const phrases: string[] = [];
  for (const match of text.matchAll(new RegExp(rule.pattern, 'giu'))) {
    if (!rule.notAfter.test(text.slice(Math.max(0, match.index - CONTEXT_CHARS), match.index))) phrases.push(match[0]);
  }
  return phrases;
}

/**
 * Every signal in a CV, in CV order (AC-8): the role and description of each project, the position
 * and description of each experience entry, the name of each certificate. Text is read in NFC, the
 * form the CV parser writes.
 */
export function softSkillSignals(profile: CvProfileMasked): SoftSkillSignal[] {
  const found: SoftSkillSignal[] = [];
  const scan = (section: SoftSkillSignal['section'], index: number, field: SignalField, text: string | null) => {
    if (text === null) return;
    const normalized = text.normalize('NFC');
    for (const signal of SOFT_SKILL_SIGNALS) {
      if (!signal.fields.has(field)) continue;
      for (const phrase of phrasesOf(signal, normalized)) found.push({ family: signal.family, section, index, phrase });
    }
  };

  profile.projects.forEach((project, index) => {
    scan('PROJECT', index, 'TITLE', project.role);
    scan('PROJECT', index, 'PROJECT_DESCRIPTION', project.description);
  });
  profile.experience.forEach((entry, index) => {
    scan('EXPERIENCE', index, 'TITLE', entry.position);
    scan('EXPERIENCE', index, 'EXPERIENCE_DESCRIPTION', entry.description);
  });
  profile.certificates.forEach((certificate, index) => scan('CERTIFICATE', index, 'CERTIFICATE', certificate.name));
  return found;
}
