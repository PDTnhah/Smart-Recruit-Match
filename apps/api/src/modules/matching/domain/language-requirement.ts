import { normalizeAudienceValue } from '@srm/shared';

// Mandatory foreign languages of a JD, read by code, never by the LLM (AGENTS › Invariant 2,
// US-3.1, CONTEXT D41). The JD's `required_languages` and the student's languages and certificates
// are both free text. A certificate is compared with one of the same kind only: there is no
// TOEIC ↔ IELTS conversion table yet.

export const LANGUAGES = ['EN', 'JA', 'KO', 'ZH', 'FR', 'DE', 'RU', 'ES', 'IT', 'TH'] as const;

export type Language = (typeof LANGUAGES)[number];

/**
 * A language outside the table is named by the word after "tiếng" ("tiếng Lào" → `other:lào`), so
 * that it still differs from every other language instead of matching any.
 */
export type LanguageId = Language | `other:${string}`;

/** Names recognised anywhere in the text. */
const LANGUAGE_NAMES: Readonly<Record<Language, readonly string[]>> = {
  EN: ['tiếng anh', 'anh văn', 'anh ngữ', 'english'],
  JA: ['tiếng nhật', 'nhật ngữ', 'japanese'],
  KO: ['tiếng hàn', 'hàn ngữ', 'korean'],
  ZH: ['tiếng trung', 'tiếng hoa', 'trung văn', 'hoa văn', 'chinese', 'mandarin'],
  FR: ['tiếng pháp', 'pháp văn', 'pháp ngữ', 'french'],
  DE: ['tiếng đức', 'đức văn', 'german'],
  RU: ['tiếng nga', 'russian'],
  ES: ['tiếng tây ban nha', 'spanish'],
  IT: ['tiếng ý', 'tiếng italia', 'italian'],
  TH: ['tiếng thái', 'thai'],
};

/** "tiếng <word>" pairs that start a name of the table; any other pair names an unknown language. */
const KNOWN_TIENG_PAIRS = new Set(
  Object.values(LANGUAGE_NAMES)
    .flat()
    .filter((name) => name.startsWith('tiếng '))
    .map((name) => name.split(' ').slice(0, 2).join(' ')),
);

/**
 * Bare names, trusted only as the first word ("Anh - TOEIC 650") and only when nothing else names
 * the language. "Trung" is left out: "trung cấp" means "intermediate".
 */
const SHORT_NAMES: Readonly<Record<string, Language>> = {
  anh: 'EN',
  nhật: 'JA',
  hàn: 'KO',
  hoa: 'ZH',
  pháp: 'FR',
  đức: 'DE',
  nga: 'RU',
};

export const CERTIFICATE_KINDS = ['TOEIC', 'IELTS', 'TOEFL_IBT', 'TOEFL_ITP', 'JLPT', 'TOPIK', 'HSK', 'CEFR'] as const;

export type CertificateKind = (typeof CERTIFICATE_KINDS)[number];

/**
 * `level` is an integer on the certificate's own scale: TOEIC and TOEFL score, IELTS band × 10,
 * JLPT 1 (N5) to 5 (N1), TOPIK and HSK level, CEFR 1 (A1) to 6 (C2). VSTEP "bậc 1–6" is CEFR.
 */
export interface Certificate {
  kind: CertificateKind;
  level: number;
}

export interface LanguageText {
  /** Several when the text names alternatives ("Tiếng Anh hoặc tiếng Nhật"); empty when none. */
  languages: LanguageId[];
  certificates: Certificate[];
}

/** Test names that tell the language even when no score can be read ("TOEIC 4 kỹ năng"). */
const KEYWORD_LANGUAGE: Readonly<Record<string, Language>> = {
  toeic: 'EN',
  ielts: 'EN',
  toefl: 'EN',
  vstep: 'EN',
  jlpt: 'JA',
  topik: 'KO',
  hsk: 'ZH',
};

interface ScoredKind {
  kind: CertificateKind;
  keyword: string;
  /** Word right after the keyword that selects this kind ("TOEFL ITP"). */
  variant?: string;
  min: number;
  max: number;
  /** Multiplier that makes a valid score an integer (IELTS has half bands). */
  scale: number;
}

/** Certificates written as a keyword followed by a score ("TOEIC 650", "TOPIK II cấp 4"). */
const SCORED_KINDS: readonly ScoredKind[] = [
  { kind: 'TOEIC', keyword: 'toeic', min: 10, max: 990, scale: 1 },
  { kind: 'IELTS', keyword: 'ielts', min: 0, max: 9, scale: 10 },
  { kind: 'TOEFL_ITP', keyword: 'toefl', variant: 'itp', min: 310, max: 677, scale: 1 },
  { kind: 'TOEFL_IBT', keyword: 'toefl', min: 0, max: 120, scale: 1 },
  { kind: 'TOPIK', keyword: 'topik', min: 1, max: 6, scale: 1 },
  { kind: 'HSK', keyword: 'hsk', min: 1, max: 9, scale: 1 },
];

/** How many words after the keyword the score may come ("TOEIC 4 kỹ năng 650"). */
const SCORE_WINDOW = 4;

/** Words that join requirements which must all be met ("TOEIC 550 và JLPT N3"). */
const AND_WORDS = new Set(['và', 'and']);

const NUMBER = /^\d+(?:[.,]\d+)?$/;
/** Letters and numbers apart, so "HSK5", "TOEIC650đ" and "N2" read as two words. */
const WORD = /[\p{L}\p{M}]+|\d+(?:[.,]\d+)?/gu;
const LETTERS = /^\p{L}/u;

/** Lower-case words and numbers; "6,5" and "6.5" stay one token. */
function tokensOf(text: string): string[] {
  return normalizeAudienceValue(text).match(WORD) ?? [];
}

/** The first valid score in the window, which ends at the next test name. */
function scoreAfter(tokens: readonly string[], index: number, kind: ScoredKind): number | null {
  for (const token of tokens.slice(index + 1, index + 1 + SCORE_WINDOW)) {
    if (token in KEYWORD_LANGUAGE) return null;
    if (!NUMBER.test(token)) continue;
    const value = Number(token.replace(',', '.')) * kind.scale;
    const level = Math.round(value);
    if (Math.abs(value - level) < 1e-9 && level >= kind.min * kind.scale && level <= kind.max * kind.scale) {
      return level;
    }
  }
  return null;
}

function certificatesOf(tokens: readonly string[]): Certificate[] {
  const certificates: Certificate[] = [];
  tokens.forEach((token, index) => {
    const next = tokens[index + 1] ?? '';
    const scored = SCORED_KINDS.find(
      (kind) => kind.keyword === token && (kind.variant === undefined || kind.variant === next),
    );
    if (scored) {
      const level = scoreAfter(tokens, index, scored);
      if (level !== null) certificates.push({ kind: scored.kind, level });
    } else if (token === 'n' && /^[1-5]$/.test(next)) {
      certificates.push({ kind: 'JLPT', level: 6 - Number(next) });
    } else if (['a', 'b', 'c'].includes(token) && /^[12]$/.test(next)) {
      certificates.push({ kind: 'CEFR', level: 'abc'.indexOf(token) * 2 + Number(next) });
    } else if (token === 'bậc' && /^[1-6]$/.test(next)) {
      certificates.push({ kind: 'CEFR', level: Number(next) });
    }
  });
  return certificates;
}

/** "tiếng <word>" outside the table; "nổi tiếng" means "famous". */
function otherLanguagesOf(tokens: readonly string[]): LanguageId[] {
  const others = new Set<LanguageId>();
  tokens.forEach((token, index) => {
    const next = tokens[index + 1];
    if (token !== 'tiếng' || next === undefined || !LETTERS.test(next) || tokens[index - 1] === 'nổi') return;
    if (!KNOWN_TIENG_PAIRS.has(`tiếng ${next}`)) others.add(`other:${next}`);
  });
  return [...others];
}

function languagesOf(tokens: readonly string[], certificates: readonly Certificate[]): LanguageId[] {
  const padded = ` ${tokens.join(' ')} `;
  const found = new Set<Language>(
    LANGUAGES.filter((language) => LANGUAGE_NAMES[language].some((name) => padded.includes(` ${name} `))),
  );
  for (const token of tokens) {
    const language = KEYWORD_LANGUAGE[token];
    if (language) found.add(language);
  }
  // A bare "N3" is a JLPT level.
  if (certificates.some((certificate) => certificate.kind === 'JLPT')) found.add('JA');
  const others = otherLanguagesOf(tokens);
  const short = SHORT_NAMES[tokens[0] ?? ''];
  if (found.size === 0 && others.length === 0 && short) found.add(short);
  return [...LANGUAGES.filter((language) => found.has(language)), ...others];
}

function read(tokens: readonly string[]): LanguageText {
  const certificates = certificatesOf(tokens);
  return { languages: languagesOf(tokens, certificates), certificates };
}

/** Reads the language and the certificates out of a requirement or a profile entry. */
export function parseLanguageText(text: string): LanguageText {
  return read(tokensOf(text));
}

/** Languages known on both sides must overlap; a side that names none does not rule a match out. */
function sameLanguage(required: LanguageText, held: LanguageText): boolean {
  if (required.languages.length === 0 || held.languages.length === 0) return true;
  return held.languages.some((language) => required.languages.includes(language));
}

function meets(required: LanguageText, held: readonly LanguageText[]): boolean {
  if (required.certificates.length > 0) {
    return held.some(
      (entry) =>
        sameLanguage(required, entry) &&
        entry.certificates.some((certificate) =>
          required.certificates.some((wanted) => wanted.kind === certificate.kind && certificate.level >= wanted.level),
        ),
    );
  }
  return held.some((entry) => entry.languages.some((language) => required.languages.includes(language)));
}

const namesSomething = (text: LanguageText): boolean => text.languages.length > 0 || text.certificates.length > 0;

/** Splits at "và" / "and" when every part names a language or a certificate, else one part. */
function partsOf(tokens: readonly string[]): LanguageText[] {
  const parts: string[][] = [[]];
  for (const token of tokens) {
    if (AND_WORDS.has(token)) parts.push([]);
    else parts[parts.length - 1]?.push(token);
  }
  const readParts = parts.filter((part) => part.length > 0).map(read);
  return readParts.length > 1 && readParts.every(namesSomething) ? readParts : [read(tokens)];
}

/**
 * Whether the student's languages and certificates (each entry as written) meet one requirement.
 * Parts joined by "và" / "and" must all be met ("Tiếng Anh và tiếng Nhật"); within a part:
 * - with certificates, an entry needs a certificate of one of those kinds at that level or above
 *   (several certificates are alternatives: "TOEIC 550 hoặc IELTS 5.5");
 * - with only a language name, an entry needs that language;
 * - otherwise, an entry must contain the requirement's words in order.
 */
export function meetsLanguageRequirement(requirement: string, entries: readonly string[]): boolean {
  const tokens = tokensOf(requirement);
  const held = entries.map(parseLanguageText);
  const parts = partsOf(tokens);
  if (parts.every(namesSomething)) return parts.every((part) => meets(part, held));
  const words = tokens.join(' ');
  return words !== '' && entries.some((entry) => ` ${tokensOf(entry).join(' ')} `.includes(` ${words} `));
}
