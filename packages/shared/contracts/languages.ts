import { normalizeAudienceValue } from './text.js';

// Foreign languages and certificates read out of free text by code, never by the LLM (AGENTS ›
// Invariant 2, US-3.1, US-3.6, CONTEXT D41, D45): the JD's required and preferred languages and
// the student's languages and certificates. Here rather than in the Core Backend so that the JD
// schema can tell when one language is both required and preferred; `matching/domain` compares
// what this reads.

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
const SHORT_NAMES: ReadonlyMap<string, Language> = new Map([
  ['anh', 'EN'],
  ['nhật', 'JA'],
  ['hàn', 'KO'],
  ['hoa', 'ZH'],
  ['pháp', 'FR'],
  ['đức', 'DE'],
  ['nga', 'RU'],
]);

export const CERTIFICATE_KINDS = [
  'TOEIC',
  'IELTS',
  'TOEFL_IBT',
  'TOEFL_IBT_BAND',
  'TOEFL_ITP',
  'JLPT',
  'TOPIK',
  'HSK',
  'CEFR',
] as const;

export type CertificateKind = (typeof CERTIFICATE_KINDS)[number];

/**
 * `level` is an integer on the certificate's own scale: TOEIC and TOEFL score, IELTS band × 10,
 * TOEFL iBT band × 10 (the 1–6 scale used since 21/01/2026), JLPT 1 (N5) to 5 (N1), TOPIK and HSK
 * level, CEFR 1 (A1) to 6 (C2). VSTEP "bậc 1–6" is CEFR.
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
const KEYWORD_LANGUAGE: ReadonlyMap<string, Language> = new Map([
  ['toeic', 'EN'],
  ['ielts', 'EN'],
  ['toefl', 'EN'],
  ['vstep', 'EN'],
  ['jlpt', 'JA'],
  ['topik', 'KO'],
  ['hsk', 'ZH'],
]);

interface ScoredKind {
  kind: CertificateKind;
  keyword: string;
  /** Word right after the keyword that selects this kind and no other ("TOEFL ITP"). */
  variant?: string;
  min: number;
  max: number;
  /** Multiplier that makes a valid score an integer (IELTS and the TOEFL band have half bands). */
  scale: number;
  /** Valid scores are multiples of this, after scaling: half bands are 5. */
  step: number;
}

/**
 * Certificates written as a keyword followed by a score ("TOEIC 650", "TOPIK II cấp 4"). Kinds that
 * share a keyword are tried in this order on each number: "TOEFL 4.5" is a band of the 1–6 scale,
 * "TOEFL 80" a score of the 0–120 scale (CONTEXT D45).
 */
const SCORED_KINDS: readonly ScoredKind[] = [
  { kind: 'TOEIC', keyword: 'toeic', min: 10, max: 990, scale: 1, step: 1 },
  { kind: 'IELTS', keyword: 'ielts', min: 0, max: 9, scale: 10, step: 5 },
  { kind: 'TOEFL_ITP', keyword: 'toefl', variant: 'itp', min: 310, max: 677, scale: 1, step: 1 },
  { kind: 'TOEFL_IBT_BAND', keyword: 'toefl', min: 1, max: 6, scale: 10, step: 5 },
  { kind: 'TOEFL_IBT', keyword: 'toefl', min: 0, max: 120, scale: 1, step: 1 },
  { kind: 'TOPIK', keyword: 'topik', min: 1, max: 6, scale: 1, step: 1 },
  { kind: 'HSK', keyword: 'hsk', min: 1, max: 9, scale: 1, step: 1 },
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

/** The kinds a keyword may be: the one its variant selects, else every kind without a variant. */
function scoredKindsAt(token: string, next: string): readonly ScoredKind[] {
  const selected = SCORED_KINDS.filter((kind) => kind.keyword === token && kind.variant === next);
  if (selected.length > 0) return selected;
  return SCORED_KINDS.filter((kind) => kind.keyword === token && kind.variant === undefined);
}

function levelOf(value: number, kind: ScoredKind): number | null {
  const scaled = value * kind.scale;
  const level = Math.round(scaled);
  const valid =
    Math.abs(scaled - level) < 1e-9 &&
    level % kind.step === 0 &&
    level >= kind.min * kind.scale &&
    level <= kind.max * kind.scale;
  return valid ? level : null;
}

/** The first number in the window that is a valid score of one of the kinds; the window ends at the next test name. */
function scoreAfter(tokens: readonly string[], index: number, kinds: readonly ScoredKind[]): Certificate | null {
  for (const token of tokens.slice(index + 1, index + 1 + SCORE_WINDOW)) {
    if (KEYWORD_LANGUAGE.has(token)) return null;
    if (!NUMBER.test(token)) continue;
    const value = Number(token.replace(',', '.'));
    for (const kind of kinds) {
      const level = levelOf(value, kind);
      if (level !== null) return { kind: kind.kind, level };
    }
  }
  return null;
}

/** Words after which a CEFR level is a certificate of its own again ("IELTS 6.5 hoặc tiếng Pháp B2"). */
const NOTE_END_WORDS = new Set(['tiếng', 'hoặc', 'or', ...AND_WORDS]);

/**
 * A CEFR level written after a certificate's score is a note on that score ("TOEIC 650 (B1)",
 * "IELTS 6.5 tương đương B2"), not one more certificate: the table, not the note, gives the level
 * of the score, so a note never lets a lower score through (CONTEXT D45). Another test name, a
 * language or "hoặc" / "và" ends the note.
 */
function certificatesOf(tokens: readonly string[]): Certificate[] {
  const certificates: Certificate[] = [];
  let afterScore = false;
  tokens.forEach((token, index) => {
    const next = tokens[index + 1] ?? '';
    const kinds = scoredKindsAt(token, next);
    const cefr =
      ['a', 'b', 'c'].includes(token) && /^[12]$/.test(next)
        ? 'abc'.indexOf(token) * 2 + Number(next)
        : token === 'bậc' && /^[1-6]$/.test(next)
          ? Number(next)
          : null;
    if (kinds.length > 0) {
      const certificate = scoreAfter(tokens, index, kinds);
      if (certificate) certificates.push(certificate);
      afterScore = certificate !== null;
    } else if (token === 'n' && /^[1-5]$/.test(next)) {
      certificates.push({ kind: 'JLPT', level: 6 - Number(next) });
      afterScore = true;
    } else if (cefr !== null) {
      if (!afterScore) certificates.push({ kind: 'CEFR', level: cefr });
    } else if (KEYWORD_LANGUAGE.has(token) || NOTE_END_WORDS.has(token)) {
      afterScore = false;
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
    const language = KEYWORD_LANGUAGE.get(token);
    if (language) found.add(language);
  }
  // A bare "N3" is a JLPT level.
  if (certificates.some((certificate) => certificate.kind === 'JLPT')) found.add('JA');
  const others = otherLanguagesOf(tokens);
  const short = SHORT_NAMES.get(tokens[0] ?? '');
  if (found.size === 0 && others.length === 0 && short) found.add(short);
  return [...LANGUAGES.filter((language) => found.has(language)), ...others];
}

function read(tokens: readonly string[]): LanguageText {
  const certificates = certificatesOf(tokens);
  return { languages: languagesOf(tokens, certificates), certificates };
}

/** Reads the languages and the certificates out of a requirement or a profile entry. */
export function parseLanguageText(text: string): LanguageText {
  return read(tokensOf(text));
}

/** Whether the text names a language or a certificate that code can compare. */
export const namesLanguage = (text: LanguageText): boolean => text.languages.length > 0 || text.certificates.length > 0;

/**
 * The parts of a requirement that must all be met: split at "và" / "and" when every part names a
 * language or a certificate ("TOEIC 550 và JLPT N3"), else the whole text as one part ("Tiếng Anh
 * nghe và nói tốt").
 */
export function languagePartsOf(text: string): LanguageText[] {
  const tokens = tokensOf(text);
  const parts: string[][] = [[]];
  for (const token of tokens) {
    if (AND_WORDS.has(token)) parts.push([]);
    else parts[parts.length - 1]?.push(token);
  }
  const readParts = parts.filter((part) => part.length > 0).map(read);
  return readParts.length > 1 && readParts.every(namesLanguage) ? readParts : [read(tokens)];
}

/** The words of the text, normalised and space-separated, for texts that name no language. */
export function languageWordsOf(text: string): string {
  return tokensOf(text).join(' ');
}
