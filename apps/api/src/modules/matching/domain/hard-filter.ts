import {
  type HardFilterFacts,
  type IneligibleReason,
  type JdHardConditions,
  normalizeAudienceValue,
  toHundredths,
} from '@srm/shared';
import { meetsLanguageRequirement } from './language-requirement.js';

export interface HardFilterResult {
  eligible: boolean;
  ineligibleReasons: IneligibleReason[];
}

/**
 * Hard conditions of a JD against one student (PRD GĐ3 step 1, FR-14, US-3.1, CONTEXT D41). Runs
 * before any LLM call: a pair that fails is never sent to the Matching Agent. Each failed condition
 * gives exactly one reason, each unmet language its own; a condition the JD does not state always
 * passes. Majors match ignoring case and surrounding spaces, as campaign targets do; GPAs are
 * compared ×100 (AGENTS › Invariant 9).
 */
export function checkHardFilters(facts: HardFilterFacts, conditions: JdHardConditions): HardFilterResult {
  const reasons: IneligibleReason[] = [];

  if (conditions.majors.length > 0) {
    const required = [...conditions.majors];
    if (facts.major === null) {
      reasons.push({ code: 'MAJOR_MISSING', required, actual: null });
    } else {
      const major = normalizeAudienceValue(facts.major);
      if (!required.some((accepted) => normalizeAudienceValue(accepted) === major)) {
        reasons.push({ code: 'MAJOR_NOT_ALLOWED', required, actual: facts.major });
      }
    }
  }

  const minYear = conditions.min_study_year;
  if (minYear !== null) {
    if (facts.yearOfStudy === null) {
      reasons.push({ code: 'YEAR_MISSING', required: minYear, actual: null });
    } else if (facts.yearOfStudy < minYear) {
      reasons.push({ code: 'YEAR_BELOW_MIN', required: minYear, actual: facts.yearOfStudy });
    }
  }

  const minGpa = conditions.min_gpa;
  if (minGpa !== null) {
    if (facts.gpa4 === null) {
      reasons.push({ code: 'GPA_MISSING', required: minGpa, actual: null });
    } else if (toHundredths(facts.gpa4) < toHundredths(minGpa)) {
      reasons.push({ code: 'GPA_BELOW_MIN', required: minGpa, actual: facts.gpa4 });
    }
  }

  for (const language of conditions.required_languages) {
    if (!meetsLanguageRequirement(language, facts.languageCertificates)) {
      reasons.push({ code: 'LANGUAGE_NOT_MET', required: language, actual: [...facts.languageCertificates] });
    }
  }

  return { eligible: reasons.length === 0, ineligibleReasons: reasons };
}
