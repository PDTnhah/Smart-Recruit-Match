import { type CvPii, type CvProfile, CvProfileSchema } from '@srm/shared';

// Personal values left in the free text of a profile, masked again after the student edits it
// (US-2.6 AC-5, BR-03, CONTEXT D40). A port of the masking half of ai-service/app/parsing/pii.py
// (`mask_text`, `mask_profile`, `find_pii`, `has_mask_token`): both sides pass every case of
// packages/shared/contracts/fixtures/pii-mask-cases.json, so change one only with the other.
//
// Python's `\w` and `\d` are Unicode-aware; here they read [\p{L}\p{N}_] and \p{Nd} under the `u`
// flag. Python's multiline `^` and `$` stop at "\n" only, written (?<![^\n]) and (?![^\n]). Offsets
// are UTF-16, as JS strings slice; lengths compared with a limit count code points, as Python does.

const WORD = String.raw`[\p{L}\p{N}_]`;

const EMAIL =
  /(?<![\p{L}\p{N}_.%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?![\p{L}\p{N}_-])/gu;
/** A Vietnamese mobile or landline number: 0 or +84, then 9 or 10 digits, spaced or not. */
const PHONE = /(?<![\p{L}\p{N}_+])(?:\(?\+84\)?[\s.-]?|0)\p{Nd}(?:[\s.-]?\p{Nd}){8,9}(?!\p{Nd})/gu;
/** Any number long enough to be a phone number, for comparing digits with the known ones. */
const DIGIT_RUN = /(?<![\p{L}\p{N}_+])\+?\(?\p{Nd}[\p{Nd} \t.()-]{7,}\p{Nd}(?!\p{Nd})/gu;
/** The rest of a link, without the punctuation of the sentence around it. */
const URL_TAIL = String.raw`[^\s<>"')\]]*[^\s<>"')\].,;:!?]`;
const URL = new RegExp(
  String.raw`(?:https?://|www\.)${URL_TAIL}` +
    String.raw`|(?<![\p{L}\p{N}_.@/])(?:github|gitlab|bitbucket|linkedin|facebook|fb|behance|dribbble)\.(?:com|me)` +
    String.raw`/${URL_TAIL}`,
  'giu',
);
/** Any token the masking writes: [NAME], [EMAIL_1], [MARITAL_STATUS]... */
const MASK_TOKEN = /\[[A-Z][A-Z_0-9]*\]/u;
const ONLY_TOKENS = /^(?:\[[A-Z_0-9]+\][\s,;|/.-]*)+$/u;

const NAME = '[NAME]';
const EMAIL_TOKEN = '[EMAIL]';
const PHONE_TOKEN = '[PHONE]';
const LINK = '[LINK]';
const ADDRESS = '[ADDRESS]';
const DOB = '[DOB]';
const HOMETOWN = '[HOMETOWN]';
const RELIGION = '[RELIGION]';
const GENDER = '[GENDER]';
const MARITAL_STATUS = '[MARITAL_STATUS]';

/**
 * A labelled personal field at the start of a line: its value is masked up to the end of the
 * line. Labels are matched on folded text (no case, no diacritics).
 */
const LABELS: ReadonlyArray<readonly [string, readonly string[]]> = [
  [NAME, ['ho va ten', 'ho ten', 'full name']],
  [GENDER, ['gioi tinh', 'gender', 'sex']],
  [MARITAL_STATUS, ['tinh trang hon nhan', 'hon nhan', 'marital status']],
  [DOB, ['ngay thang nam sinh', 'ngay sinh', 'nam sinh', 'date of birth', 'birthday', 'dob']],
  [HOMETOWN, ['que quan', 'nguyen quan', 'que', 'hometown', 'place of origin']],
  [RELIGION, ['ton giao', 'religion']],
  [ADDRESS, ['dia chi', 'noi o', 'cho o', 'address']],
];
const LABEL_TOKENS = new Map(LABELS.flatMap(([token, labels]) => labels.map((label) => [label, token] as const)));
const LABELLED = new RegExp(
  String.raw`(?<![^\n])[ \t]*(?:[-*•·+][ \t]*)?(?<label>` +
    [...LABEL_TOKENS.keys()]
      .map(escapeRegExp)
      .sort((a, b) => b.length - a.length)
      .join('|') +
    String.raw`)(?:[ \t]+hien[ \t]+tai)?[ \t]*(?:[:：\-–][ \t]*|\t+)(?<value>\S[^\n]*)(?![^\n])`,
  'gu',
);
const LINK_PREFIXES = new Set(['in', 'pub', 'u', 'user', 'users', 'profile', 'people', '@']);
/** Shorter email local parts and usernames ("an", "vn") are too common to mask as words. */
const MIN_LOCAL_PART = 4;
/**
 * Between the words of a name: spaces, or nothing as in "nguyenvanan", or one dot, dash or
 * underscore. Never " - ": that separates two names, not the words of one.
 */
const NAME_GAP = String.raw`(?:\s+|[._-]?)`;
/** Close to Python's `unicodedata.combining`; the two differ only on marks of a few non-Latin scripts. */
const COMBINING = /\p{Mn}/u;

// --- folding --------------------------------------------------------------------------------

export interface Folded {
  text: string;
  /** For each UTF-16 unit of `text`, where the original character it came from starts and ends. */
  from: number[];
  to: number[];
}

/** Lower case without diacritics ("Đặng" -> "dang"), mapped back to the original characters. */
export function fold(text: string): Folded {
  let folded = '';
  const from: number[] = [];
  const to: number[] = [];
  let index = 0;
  for (const char of text) {
    const end = index + char.length;
    for (const part of char.replace('đ', 'd').replace('Đ', 'D').normalize('NFD')) {
      if (COMBINING.test(part)) continue;
      const lower = part.toLowerCase();
      folded += lower;
      for (let unit = 0; unit < lower.length; unit += 1) {
        from.push(index);
        to.push(end);
      }
    }
    index = end;
  }
  return { text: folded, from, to };
}

function folded(text: string): string {
  return fold(text).text;
}

/** Digits of a phone number, with +84 read as 0: "+84 912.345.678" -> "0912345678". */
export function phoneKey(value: string): string {
  const digits = value.replace(/\P{Nd}/gu, '');
  return digits.startsWith('84') && [11, 12].includes(length(digits)) ? `0${digits.slice(2)}` : digits;
}

// --- masking --------------------------------------------------------------------------------

interface Pattern {
  regex: RegExp;
  token: string;
  /** Matched against the folded text (personal values), or the original (generic formats). */
  onFolded: boolean;
}

interface Span {
  start: number;
  end: number;
  token: string;
}

/** Built once per CvPii: masking a profile and the final check run them over every string. */
const PATTERNS = new WeakMap<CvPii, readonly Pattern[]>();

function patternsOf(pii: CvPii): readonly Pattern[] {
  let patterns = PATTERNS.get(pii);
  if (!patterns) {
    patterns = [...valuePatterns(pii), ...GENERIC];
    PATTERNS.set(pii, patterns);
  }
  return patterns;
}

function valuePatterns(pii: CvPii): Pattern[] {
  const found: Pattern[] = [];
  const addValue = (value: string | null, token: string, gap = String.raw`\s+`) => {
    const words = wordsOf(folded(value ?? ''));
    if (words.length > 0) found.push(onFolded(words.map(escapeRegExp).join(gap), token));
  };

  const words = wordsOf(pii.full_name ?? '');
  if (words.length > 0) {
    const orders = [words, [...words.slice(-1), ...words.slice(0, -1)]];
    if (words.length >= 3) orders.push([words[0]!, words.at(-1)!], [words.at(-1)!, words[0]!]);
    for (const order of orders) addValue(order.join(' '), NAME, NAME_GAP);
  }
  for (const email of pii.emails) {
    addValue(email, EMAIL_TOKEN);
    const local = email.split('@', 1)[0]!;
    if (length(local) >= MIN_LOCAL_PART) addValue(local, EMAIL_TOKEN);
  }
  for (const link of pii.links) {
    addValue(linkKey(link), LINK);
    const username = usernameOf(link);
    if (username) addValue(username, LINK);
  }
  addValue(pii.address, ADDRESS);
  addValue(pii.hometown, HOMETOWN);
  addValue(pii.religion, RELIGION);
  if (pii.date_of_birth) {
    addValue(pii.date_of_birth, DOB);
    found.push(...datePatterns(pii.date_of_birth));
  }
  return found;
}

function onFolded(pattern: string, token: string): Pattern {
  return { regex: new RegExp(`(?<!${WORD})${pattern}(?!${WORD})`, 'gu'), token, onFolded: true };
}

const GENERIC: readonly Pattern[] = [
  { regex: URL, token: LINK, onFolded: false },
  { regex: EMAIL, token: EMAIL_TOKEN, onFolded: false },
  { regex: PHONE, token: PHONE_TOKEN, onFolded: false },
];

/**
 * The date of birth in the usual Vietnamese and ISO forms, whatever form the CV used. ASCII
 * digits only: Python also reads other decimal digits, which no CV writes a date in.
 */
function datePatterns(dob: string): Pattern[] {
  const numbers = dob.match(/\p{Nd}+/gu) ?? [];
  if (numbers.length !== 3 || numbers.some((number) => !/^[0-9]+$/u.test(number))) return [];
  const [year, month, day] = length(numbers[0]) === 4 ? numbers : [numbers[2]!, numbers[1]!, numbers[0]];
  if (length(year) !== 4) return [];
  const d = `0?${Number(day)}`;
  const m = `0?${Number(month)}`;
  const sep = String.raw`\s*[/.-]\s*`;
  return [
    onFolded(`${d}${sep}${m}${sep}${year}`, DOB),
    onFolded(`${year}${sep}${m}${sep}${d}`, DOB),
    onFolded(String.raw`(?:ngay\s+)?${d}\s+thang\s+${m}\s*,?\s+nam\s+${year}`, DOB),
  ];
}

function linkKey(link: string): string {
  return link
    .trim()
    .toLowerCase()
    .replace(/^(?:https?:\/\/)?(?:www\.)?/u, '')
    .replace(/\/+$/u, '');
}

function usernameOf(link: string): string | null {
  const path = link
    .trim()
    .replace(/^(?:https?:\/\/)?[^/]+\/?/u, '')
    .split('?', 1)[0]!;
  for (const raw of path.split('/')) {
    const segment = raw.replace(/^@+/u, '');
    if (segment && !LINK_PREFIXES.has(segment.toLowerCase())) {
      return length(segment) >= MIN_LOCAL_PART ? segment : null;
    }
  }
  return null;
}

/** Every personal value found in `text`, as offsets in the original text. */
function spansOf(text: string, pii: CvPii): Span[] {
  const source = fold(text);
  const spans: Span[] = [];
  for (const pattern of patternsOf(pii)) {
    for (const match of (pattern.onFolded ? source.text : text).matchAll(pattern.regex)) {
      if (match[0].length === 0) continue;
      const end = match.index + match[0].length;
      spans.push(
        pattern.onFolded
          ? { start: source.from[match.index]!, end: source.to[end - 1]!, token: pattern.token }
          : { start: match.index, end, token: pattern.token },
      );
    }
  }
  const phones = new Set(pii.phones.map(phoneKey));
  for (const match of text.matchAll(DIGIT_RUN)) {
    if (phones.has(phoneKey(match[0]))) {
      spans.push({ start: match.index, end: match.index + match[0].length, token: PHONE_TOKEN });
    }
  }
  for (const match of source.text.matchAll(LABELLED)) {
    const { label, value } = match.groups as { label: string; value: string };
    // The value runs to the end of the match: only the lookahead follows it.
    const valueEnd = match.index + match[0].length;
    const start = source.from[valueEnd - value.length]!;
    const end = source.to[valueEnd - 1]!;
    // Already masked ("Giới tính: [GENDER]"): nothing personal is left on the line.
    if (!ONLY_TOKENS.test(text.slice(start, end).trim())) spans.push({ start, end, token: LABEL_TOKENS.get(label)! });
  }
  return spans;
}

/**
 * `text` with every personal value replaced by its token. Overlapping finds keep the longest, so
 * "nguyenvanan@example.com" is one [EMAIL], not a [NAME] inside one.
 */
export function maskText(text: string, pii: CvPii): string {
  const chosen: Span[] = [];
  const longestFirst = spansOf(text, pii).sort((a, b) => a.start - a.end - (b.start - b.end) || a.start - b.start);
  for (const span of longestFirst) {
    if (chosen.every((other) => span.end <= other.start || span.start >= other.end)) chosen.push(span);
  }
  let masked = text;
  for (const span of chosen.sort((a, b) => b.start - a.start)) {
    masked = masked.slice(0, span.start) + span.token + masked.slice(span.end);
  }
  return masked;
}

/** `profile_masked`: the profile with `maskText` applied to every string (BR-03). */
export function maskProfile(profile: CvProfile, pii: CvPii): CvProfile {
  return CvProfileSchema.parse(mapStrings(profile, (text) => maskText(text, pii)));
}

// --- final check ----------------------------------------------------------------------------

/** Tokens of the personal values still in `text`; empty when masking worked. */
export function findPii(text: string, pii: CvPii): string[] {
  return [...new Set(spansOf(text, pii).map((span) => span.token))].sort();
}

/** `text` had personal data replaced, so it is not passed on as is (US-2.5 new skills). */
export function hasMaskToken(text: string): boolean {
  return MASK_TOKEN.test(text);
}

/** Every string in a nested structure of objects and arrays. */
export function stringsOf(value: unknown): string[] {
  const found: string[] = [];
  mapStrings(value, (text) => {
    found.push(text);
    return text;
  });
  return found;
}

function mapStrings(value: unknown, change: (text: string) => string): unknown {
  if (typeof value === 'string') return change(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, change));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, change)]));
  }
  return value;
}

function wordsOf(text: string): string[] {
  return text.split(/\s+/u).filter((word) => word !== '');
}

/** Length in code points, as Python's `len`. */
function length(text: string): number {
  return [...text].length;
}

/** `text` as a literal in a `u` pattern, where only syntax characters may be escaped. */
function escapeRegExp(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|/]/gu, '\\$&');
}
