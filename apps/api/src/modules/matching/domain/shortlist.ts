import { toHundredths } from '@srm/shared';

/** What the shortlist reads of one student × JD result. */
export interface ShortlistCandidate {
  jdId: number;
  eligible: boolean;
  /** null while the pair has no S_cv, e.g. dropped by the embedding pre-filter (PRD GĐ3 step 2). */
  scvX100: number | null;
}

/**
 * The one rule for "this JD is on the student's shortlist" (PRD GĐ3, US-3.1, CONTEXT D36): the hard
 * conditions are met and S_cv ≥ θ_cv, compared ×100 (AGENTS › Invariant 9), so S_cv equal to θ_cv
 * passes. Both readings of the S_cv matrix use it: the JDs suggested to a student and the CVs that
 * fit a JD.
 */
export function meetsCvThreshold(candidate: ShortlistCandidate, thetaCv: number): boolean {
  return candidate.eligible && candidate.scvX100 !== null && candidate.scvX100 >= toHundredths(thetaCv);
}

/** The student's shortlist: best S_cv first, equal S_cv by `jdId` ascending so the order is fixed. */
export function selectShortlist<T extends ShortlistCandidate>(candidates: readonly T[], thetaCv: number): T[] {
  return candidates
    .filter((candidate): candidate is T & { scvX100: number } => meetsCvThreshold(candidate, thetaCv))
    .sort((a, b) => b.scvX100 - a.scvX100 || a.jdId - b.jdId);
}
