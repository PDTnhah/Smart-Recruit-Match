import {
  type JdRequirements,
  LANGUAGE_LIST_MAX,
  languagePartsOf,
  type LanguageText,
  type MatchLanguageVerdict,
  type MatchVerdict,
  namesLanguage,
  parseLanguageText,
} from '@srm/shared';
import { formatCertificate, languageLabel } from './language-cefr.js';
import { type LanguageRule, matchLanguageRequirement } from './language-requirement.js';
import { LANGUAGE_SCORE_RULES, MAX_EVIDENCE_CHARS } from './matching-rules.js';
import { joinWithin } from './quote.js';
import { VERDICT_HALVES } from './scv.js';

// The language criterion of S_cv, by code (FR-40, US-3.6 AC-5, CONTEXT D42, D45): each required and
// each preferred language of the JD gets a verdict, and their average gives the criterion's. A pair
// that passed the hard filter meets every required language, so the preferred ones make the
// difference.

export type LanguageRequirements = Pick<JdRequirements, 'hard_conditions' | 'preferred_languages'>;

/** Whether the average, `halves / (2 · count)`, is at least `bound`; in integers. */
const atLeast = (halves: number, count: number, bound: { num: number; den: number }): boolean =>
  halves * bound.den >= bound.num * 2 * count;

function formatPart(part: LanguageText): string {
  const language = part.languages.length === 1 ? part.languages[0] : undefined;
  if (part.certificates.length === 0) return part.languages.map(languageLabel).join(' hoặc ');
  return part.certificates.map((certificate) => formatCertificate(certificate, language)).join(' hoặc ');
}

/** A JD entry with the CEFR level of each certificate ("TOEIC 550 (B1) và JLPT N3"); as written without one. */
function formatRequirement(text: string): string {
  const parts = languagePartsOf(text);
  if (!parts.every(namesLanguage) || parts.every((part) => part.certificates.length === 0)) return text.trim();
  return parts.map(formatPart).join(' và ');
}

/** A CV entry by its certificates with their CEFR levels ("IELTS 6.5 (B2)"); as written without one. */
function formatHeld(text: string): string {
  const read = parseLanguageText(text);
  if (read.certificates.length === 0) return text.trim();
  const language = read.languages.length === 1 ? read.languages[0] : undefined;
  return read.certificates.map((certificate) => formatCertificate(certificate, language)).join(', ');
}

/**
 * The language criterion of one student for one JD, or null when the JD neither requires nor
 * prefers a language (the criterion is empty, CONTEXT D41). `entries` are the student's languages
 * with their levels and certificate names, as written; the evidence quotes the ones the verdicts
 * rest on (AGENTS › Invariant 5).
 */
export function scoreLanguage(requirements: LanguageRequirements, entries: readonly string[]): MatchLanguageVerdict | null {
  const items: { text: string; rule: LanguageRule }[] = [
    ...requirements.hard_conditions.required_languages.map((text) => ({ text, rule: 'REQUIRED' as const })),
    ...requirements.preferred_languages.map((text) => ({ text, rule: 'PREFERRED' as const })),
  ];
  if (items.length === 0) return null;

  const matches = items.map((item) => matchLanguageRequirement(item.text, entries, item.rule));
  const halves = matches.reduce((sum, match) => sum + VERDICT_HALVES[match.verdict], 0);
  const verdict: MatchVerdict = atLeast(halves, items.length, LANGUAGE_SCORE_RULES.met)
    ? 'MET'
    : atLeast(halves, items.length, LANGUAGE_SCORE_RULES.partial)
      ? 'PARTIAL'
      : 'NOT_MET';

  const sources = [...new Set(matches.flatMap((match) => match.sources))].sort((a, b) => a - b);
  const quoted = sources.map((index) => entries[index]?.trim() ?? '').filter((text) => text !== '');
  const required = items.map((item) =>
    item.rule === 'PREFERRED' ? `${formatRequirement(item.text)} (ưu tiên)` : formatRequirement(item.text),
  );
  return {
    verdict,
    evidence: verdict === 'NOT_MET' || quoted.length === 0 ? null : joinWithin(quoted, '; ', MAX_EVIDENCE_CHARS),
    required: joinWithin(required, '; ', LANGUAGE_LIST_MAX),
    held: entries.length === 0 ? null : joinWithin(entries.map(formatHeld), '; ', LANGUAGE_LIST_MAX),
  };
}
