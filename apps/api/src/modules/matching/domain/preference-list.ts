import type { PreferenceRejectionCode } from '@srm/shared';

// The rules of a preference list (FR-16, BR-04, US-3.3 AC-6, AC-8, CONTEXT D47). Pure; the service
// runs it under the student's lock, against the shortlist of `shortlist-view.ts`.

export interface PreferenceEntry {
  jdId: number;
  rank: number;
}

export interface PreferenceRules {
  /** N_NV of the campaign. */
  nNv: number;
  /** The student's shortlist, best first. */
  shortlistJdIds: readonly number[];
  /** `require_full_preferences`: min(N_NV, shortlist size) preferences, not fewer. */
  requireFull: boolean;
}

export type PreferenceCheck =
  | { ok: true }
  | { ok: false; code: PreferenceRejectionCode; jdIds?: number[] };

/** How many preferences a full list holds. */
export function fullPreferenceCount(rules: Pick<PreferenceRules, 'nNv' | 'shortlistJdIds'>): number {
  return Math.min(rules.nNv, rules.shortlistJdIds.length);
}

/**
 * The first rule the list breaks, checked in this order: size, duplicate JD, ranks 1…n, JDs outside
 * the shortlist (named in `jdIds`), then completeness. An empty list is valid unless a full one is
 * required and the shortlist is not empty.
 */
export function checkPreferenceList(items: readonly PreferenceEntry[], rules: PreferenceRules): PreferenceCheck {
  if (items.length > rules.nNv) return { ok: false, code: 'PREFERENCES_TOO_MANY' };

  const jdIds = items.map((item) => item.jdId);
  if (new Set(jdIds).size !== jdIds.length) return { ok: false, code: 'PREFERENCE_DUPLICATE_JD' };

  const ranks = items.map((item) => item.rank).sort((a, b) => a - b);
  if (ranks.some((rank, index) => rank !== index + 1)) return { ok: false, code: 'PREFERENCE_RANK_NOT_CONTIGUOUS' };

  const shortlist = new Set(rules.shortlistJdIds);
  const outside = jdIds.filter((jdId) => !shortlist.has(jdId));
  if (outside.length > 0) return { ok: false, code: 'PREFERENCE_NOT_IN_SHORTLIST', jdIds: outside };

  if (rules.requireFull && items.length < fullPreferenceCount(rules)) return { ok: false, code: 'PREFERENCES_INCOMPLETE' };
  return { ok: true };
}

/** Q6 (CONTEXT D47): the first min(N_NV, shortlist size) JDs of the shortlist, NV1 the best S_cv. */
export function autoAssignedPreferences(rules: Pick<PreferenceRules, 'nNv' | 'shortlistJdIds'>): PreferenceEntry[] {
  return rules.shortlistJdIds.slice(0, fullPreferenceCount(rules)).map((jdId, index) => ({ jdId, rank: index + 1 }));
}
