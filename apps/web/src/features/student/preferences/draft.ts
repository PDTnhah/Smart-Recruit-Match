import type { PreferenceItem, ReplacePreferencesRequest } from '@srm/shared';

// The preference list the student is editing, as JD ids in order: the first is NV1. Kept on the
// client until "Lưu nguyện vọng" sends it whole (CONTEXT D47). Pure functions, no React.

export type Draft = readonly number[];

/** The saved list, NV1 first. */
export function draftOf(preferences: readonly PreferenceItem[]): Draft {
  return [...preferences].sort((a, b) => a.rank - b.rank).map((preference) => preference.jdId);
}

/** Adds the JD as the last preference; a JD already listed or a full list is left as is. */
export function addToDraft(draft: Draft, jdId: number, max: number): Draft {
  if (draft.includes(jdId) || draft.length >= max) return draft;
  return [...draft, jdId];
}

export function removeFromDraft(draft: Draft, jdId: number): Draft {
  return draft.filter((id) => id !== jdId);
}

/** Moves the preference at `from` to `to`; out-of-range positions leave the list as is. */
export function moveInDraft(draft: Draft, from: number, to: number): Draft {
  if (from === to || from < 0 || to < 0 || from >= draft.length || to >= draft.length) return draft;
  const next = [...draft];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return draft;
  next.splice(to, 0, moved);
  return next;
}

export function sameDraft(a: Draft, b: Draft): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** Body of `PUT /api/me/preferences`: ranks from 1 with no gap (AC-6). */
export function requestOf(campaignId: number, draft: Draft): ReplacePreferencesRequest {
  return { campaignId, preferences: draft.map((jdId, index) => ({ jdId, rank: index + 1 })) };
}
