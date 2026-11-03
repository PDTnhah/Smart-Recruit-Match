import { type EvidenceSection, SKILL_LEVEL_EVIDENCE, type SkillFamily, type SkillLevel } from '@srm/shared';

// The rules by which code reads skill evidence from a CV and matches it to a JD, and scores the
// language criterion (FR-40, US-3.5, US-3.6, CONTEXT D42, D44, D45). Stored with every match result;
// a change of any value here is a new version.

export const MATCHING_RULES_VERSION = 'matching-rules/v1';

/** T0 none, T1 listed, T2 used, T3 used often, T4 proficient (PRD › Khung quy đổi mức bằng chứng). */
export type EvidenceTier = 0 | 1 | 2 | 3 | 4;

/**
 * Thresholds of the tiers (CONTEXT D44). One CV entry is one source; the skills list gives T1 only.
 * T2: one project, experience or certificate. T3: this many project or experience entries.
 * T4: experience entries using the skill that cover this many months together; projects add no
 * months, since a study project is not work. The numbers come from `SKILL_LEVEL_EVIDENCE`, which
 * the HR form shows (US-3.6 AC-9).
 */
export const TIER_RULES = {
  t3MinProjectOrExperienceSources: SKILL_LEVEL_EVIDENCE.intermediateMinProjectOrExperience,
  t4MinExperienceMonths: SKILL_LEVEL_EVIDENCE.advancedMinExperienceMonths,
} as const;

/**
 * Tiers of a soft skill (PRD › Kỹ năng mềm): signals in this many distinct CV entries give T2, T3,
 * T4; a soft skill only claimed in the skills list is T1.
 */
export const SOFT_SKILL_TIER_RULES = {
  t2MinSignalEntries: 1,
  t3MinSignalEntries: 2,
  t4MinSignalEntries: 3,
} as const;

/** The tier a JD level needs for MET; lower tiers from T1 give PARTIAL. */
export const LEVEL_TIER: Readonly<Record<SkillLevel, EvidenceTier>> = { BASIC: 2, INTERMEDIATE: 3, ADVANCED: 4 };

/** A same-family skill stands in for the JD skill (PARTIAL) from this tier. */
export const FAMILY_MIN_TIER: EvidenceTier = 2;

/** English cannot stand in for Japanese; languages have their own criterion (US-3.6). */
export const FAMILY_RULE_EXCLUDED: ReadonlySet<SkillFamily> = new Set<SkillFamily>(['FOREIGN_LANGUAGE']);

/**
 * Free text is compared by n-grams of 1 to this many words, the longest first. A Vietnamese word is
 * one syllable, so catalogue names run long: "Cấu trúc dữ liệu và giải thuật" has 7.
 */
export const MAX_NGRAM_WORDS = 8;

/** Shorter keys match only through the skills list and the technologies of a project. */
export const MIN_FREE_TEXT_KEY_LENGTH = 3;

/**
 * Keys (`skillMatchKey`) that are also everyday words, so they match only through the skills list
 * and the technologies of a project: "Go to market", "học kỳ Spring 2024", "Microsoft Word",
 * "chức năng thống kê doanh thu", "chứng chỉ Oracle Certified Java", "the rest of the team".
 */
export const COMMON_WORD_KEYS: ReadonlySet<string> = new Set([
  'go',
  'r',
  'c',
  'swift',
  'rust',
  'dart',
  'spring',
  'express',
  'flask',
  'next',
  'nest',
  'unity',
  'spark',
  'hive',
  'excel',
  'word',
  'access',
  'teams',
  'ruby',
  'rails',
  'net',
  'less',
  'make',
  'rest',
  'node',
  'shell',
  'oracle',
  'solid',
  'networking',
  'statistics',
  'thốngkê',
]);

/** A date with a year only ("2023") stands for June of that year, at the start and at the end. */
export const YEAR_ONLY_MONTH = 6;

/** "Hiện tại" and the months of a CV are read in Vietnam time (UTC+7, no daylight saving). */
export const REF_UTC_OFFSET_HOURS = 7;

/** Longest `evidence` of a verdict, as the contract allows. */
export const MAX_EVIDENCE_CHARS = 1000;

/** Order of the sources of a verdict: the strongest evidence first. */
export const SECTION_ORDER: readonly EvidenceSection[] = ['EXPERIENCE', 'PROJECT', 'CERTIFICATE', 'SKILLS_LIST'];

/**
 * The language criterion averages its entries, MET = 1 and PARTIAL = 0.5, and reads the average as
 * a verdict: at least `met` is MET, at least `partial` PARTIAL, else NOT_MET (CONTEXT D45). Fractions
 * so that the comparison stays in integers.
 */
export const LANGUAGE_SCORE_RULES = {
  met: { num: 3, den: 4 },
  partial: { num: 1, den: 4 },
} as const;
