// BR-07 (US-5.2 AC-2): only a pair that passed the JD's hard filter, with S_cv ≥ θ_cv and
// S_test ≥ θ_test, enters the engine. Every other preference is kept with its reasons, for the
// snapshot (BR-17) and for "why am I not at A?" (NFR-4). Scores are integers ×100.

import { InvalidAllocationInputError } from './errors.js';
import type { JdId, StudentId } from './types.js';

/** Codes of `ALLOCATION_EXCLUSION_REASONS` (@srm/shared), repeated here: the domain imports nothing. */
export type ExclusionReason = 'HARD_FILTER' | 'BELOW_THETA_CV' | 'BELOW_THETA_TEST' | 'TEST_NOT_TAKEN';

/** One preference of a student as the round reads it. */
export interface CandidatePair {
  studentId: StudentId;
  jdId: JdId;
  /** NV rank of the student, 1 first. */
  preferenceRank: number;
  /** `match_results.eligible` of the pair and the codes of its `ineligible_reasons`. */
  hardFilter: { eligible: boolean; codes: string[] };
  /** ×100; null when the pair has none. */
  sCv: number | null;
  /** ×100; null when the test was never taken (the preference is CLOSED, BR-06). */
  sTest: number | null;
  /** ×100; null before grading. */
  sFinal: number | null;
}

export interface Thresholds {
  /** θ_cv ×100. */
  thetaCv: number;
  /** θ_test ×100. */
  thetaTest: number;
}

export interface ExcludedPair extends CandidatePair {
  /** At least one, in the order of `ExclusionReason`. */
  reasons: ExclusionReason[];
}

export interface Eligibility {
  eligible: CandidatePair[];
  excluded: ExcludedPair[];
}

/** The reasons BR-07 keeps a pair out of the engine; empty when it may be nominated. */
export function exclusionReasons(pair: CandidatePair, thresholds: Thresholds): ExclusionReason[] {
  const reasons: ExclusionReason[] = [];
  if (!pair.hardFilter.eligible) reasons.push('HARD_FILTER');
  if (pair.sCv === null || pair.sCv < thresholds.thetaCv) reasons.push('BELOW_THETA_CV');
  if (pair.sTest === null) reasons.push('TEST_NOT_TAKEN');
  else if (pair.sTest < thresholds.thetaTest) reasons.push('BELOW_THETA_TEST');
  return reasons;
}

/** Splits the preferences by BR-07, keeping their order. An eligible pair always has its S_final. */
export function filterEligible(pairs: readonly CandidatePair[], thresholds: Thresholds): Eligibility {
  const eligible: CandidatePair[] = [];
  const excluded: ExcludedPair[] = [];
  for (const pair of pairs) {
    const reasons = exclusionReasons(pair, thresholds);
    if (reasons.length > 0) excluded.push({ ...pair, reasons });
    else if (pair.sFinal === null) throw new InvalidAllocationInputError(`pair ${pair.studentId} × ${pair.jdId} is eligible without S_final`);
    else eligible.push(pair);
  }
  return { eligible, excluded };
}
