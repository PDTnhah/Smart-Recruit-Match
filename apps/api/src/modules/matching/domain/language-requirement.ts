import {
  type Certificate,
  type LanguageText,
  languagePartsOf,
  languageWordsOf,
  type MatchVerdict,
  namesLanguage,
  parseLanguageText,
} from '@srm/shared';
import { cefrOf } from './language-cefr.js';
import { VERDICT_HALVES } from './scv.js';

// Foreign languages of a JD against the student's, by code, never by the LLM (AGENTS › Invariant
// 2, US-3.1, US-3.6, CONTEXT D41, D42, D45). `@srm/shared` reads the free text; this file compares
// what it reads. A certificate meets one of the same kind by its own score and one of another kind
// in the same language through CEFR (`language-cefr.ts`); JLPT, TOPIK and HSK have no CEFR table,
// so only their own kind.

/** A required language must be met; a preferred one also earns PARTIAL when close (CONTEXT D45). */
export type LanguageRule = 'REQUIRED' | 'PREFERRED';

/** What one requirement got, and the entries it rests on by position (empty for NOT_MET). */
export interface LanguageMatch {
  verdict: MatchVerdict;
  sources: number[];
}

const notMet = (): LanguageMatch => ({ verdict: 'NOT_MET', sources: [] });

/** Whether the entry names one of the languages of the part. */
const namesLanguageOf = (part: LanguageText, entry: LanguageText): boolean =>
  entry.languages.some((language) => part.languages.includes(language));

/**
 * Whether a certificate of the entry may stand for one of the part: of the same kind when the
 * languages known on both sides overlap, or when a side names none ("B2" against "CEFR B1"); of
 * another kind only when both sides name the language, so that "Giấy phép lái xe B2" or "DELF B2"
 * never meets "TOEIC 550".
 */
function comparable(part: LanguageText, entry: LanguageText, held: Certificate, wanted: Certificate): boolean {
  if (held.kind !== wanted.kind) return namesLanguageOf(part, entry);
  return part.languages.length === 0 || entry.languages.length === 0 || namesLanguageOf(part, entry);
}

/** Whether a certificate of the entry passes `test` against one of the part's, comparable as above. */
const anyCertificate = (part: LanguageText, entry: LanguageText, test: (held: Certificate, wanted: Certificate) => boolean) =>
  entry.certificates.some((held) =>
    part.certificates.some((wanted) => comparable(part, entry, held, wanted) && test(held, wanted)),
  );

/** At or above the wanted certificate: the same kind by its score, another kind by CEFR level. */
export function certificateMeets(held: Certificate, wanted: Certificate): boolean {
  if (held.kind === wanted.kind) return held.level >= wanted.level;
  const heldCefr = cefrOf(held);
  const wantedCefr = cefrOf(wanted);
  return heldCefr !== null && wantedCefr !== null && heldCefr >= wantedCefr;
}

/**
 * At most one level under the wanted certificate: by CEFR when both have a level, so a lower score
 * of the same CEFR level counts too; JLPT, TOPIK and HSK by one step of their own scale.
 */
function withinOneLevel(held: Certificate, wanted: Certificate): boolean {
  const heldCefr = cefrOf(held);
  const wantedCefr = cefrOf(wanted);
  if (heldCefr !== null && wantedCefr !== null) return heldCefr >= wantedCefr - 1;
  return held.kind === wanted.kind && held.level >= wanted.level - 1;
}

/**
 * With certificates, the entry needs one of those kinds (they are alternatives: "TOEIC 550 hoặc
 * IELTS 5.5") at that level or above; with only a language name, the entry needs that language.
 */
function meetsPart(part: LanguageText, entry: LanguageText): boolean {
  if (part.certificates.length > 0) return anyCertificate(part, entry, certificateMeets);
  return namesLanguageOf(part, entry);
}

function matchPart(part: LanguageText, held: readonly LanguageText[], rule: LanguageRule): LanguageMatch {
  const where = (test: (entry: LanguageText) => boolean): number[] =>
    held.flatMap((entry, index) => (test(entry) ? [index] : []));
  const met = where((entry) => meetsPart(part, entry));
  if (met.length > 0) return { verdict: 'MET', sources: met };
  if (rule === 'REQUIRED' || part.certificates.length === 0) return notMet();

  // Preferred: a certificate one level short, or an entry naming the language without any
  // certificate. Per entry, so that listing one more certificate never lowers the verdict.
  const close = where(
    (entry) =>
      anyCertificate(part, entry, withinOneLevel) ||
      (entry.certificates.length === 0 && namesLanguageOf(part, entry)),
  );
  return close.length > 0 ? { verdict: 'PARTIAL', sources: close } : notMet();
}

/**
 * The verdict of one requirement against the student's languages and certificates (each entry as
 * written). Parts joined by "và" / "and" must all be met, so the lowest verdict of the parts
 * counts; a requirement that names neither a language nor a certificate is met by an entry that
 * contains its words in order.
 */
export function matchLanguageRequirement(
  requirement: string,
  entries: readonly string[],
  rule: LanguageRule = 'REQUIRED',
): LanguageMatch {
  const parts = languagePartsOf(requirement);
  if (parts.every(namesLanguage)) {
    const held = entries.map(parseLanguageText);
    const matches = parts.map((part) => matchPart(part, held, rule));
    const lowest = matches.reduce((low, match) => (VERDICT_HALVES[match.verdict] < VERDICT_HALVES[low.verdict] ? match : low));
    if (lowest.verdict === 'NOT_MET') return notMet();
    const sources = [...new Set(matches.flatMap((match) => match.sources))].sort((a, b) => a - b);
    return { verdict: lowest.verdict, sources };
  }
  const words = languageWordsOf(requirement);
  if (words === '') return notMet();
  const sources = entries.flatMap((entry, index) => (` ${languageWordsOf(entry)} `.includes(` ${words} `) ? [index] : []));
  return sources.length > 0 ? { verdict: 'MET', sources } : notMet();
}

/** Whether the student's languages and certificates meet one required language (hard filter, AC-3). */
export function meetsLanguageRequirement(requirement: string, entries: readonly string[]): boolean {
  return matchLanguageRequirement(requirement, entries).verdict === 'MET';
}
