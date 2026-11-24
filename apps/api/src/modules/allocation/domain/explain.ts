// NFR-4 (US-5.2 AC-13): "why am I not at A?". For each preference a student ranked above the JD
// they hold (every preference when they hold none), the reason, read from the round's snapshot and
// its nominations alone. The center sees the figures behind it; the student sees only the reason
// and their own score (PRD › Personas).

import { compareRankKeys } from './compare.js';
import type { ExclusionReason } from './eligibility.js';
import type { AllocationInputSnapshot } from './snapshot.js';
import type { JdId, RankKey, StudentId } from './types.js';

/** Codes of `ALLOCATION_OUTCOME_REASONS` (@srm/shared). */
export type OutcomeReason = 'FULL_WITH_HIGHER_RANKED' | 'ZERO_CAPACITY' | 'NOT_ELIGIBLE' | 'DEMOTED' | 'MANUAL_ADJUSTMENT';

export interface OutcomeItem {
  jdId: JdId;
  preferenceRank: number;
  reason: OutcomeReason;
  /** With NOT_ELIGIBLE: the rules of BR-07 the pair failed. */
  exclusionReasons: ExclusionReason[];
  /** The student's S_final ×100 at the JD; null when the pair has none. */
  sFinal: number | null;
  capacity: number;
  held: number;
  /** The lowest-ranked student the JD holds; null when it holds nobody. */
  lowestHeld: { studentId: StudentId; studentCode: string; sFinal: number } | null;
}

export interface Outcome {
  studentId: StudentId;
  nominatedJdId: JdId | null;
  items: OutcomeItem[];
}

/** What the student may see of an outcome: no other student's score or rank. */
export interface StudentOutcome {
  nominatedJdId: JdId | null;
  items: Pick<OutcomeItem, 'jdId' | 'preferenceRank' | 'reason' | 'exclusionReasons' | 'sFinal'>[];
}

/**
 * `held` is the round's nominations as they stand, after any manual adjustment: by JD, the
 * students it holds. A preference the engine would have given (a free seat, or a holder the student
 * outranks) is not at the student only because the center changed the draft: MANUAL_ADJUSTMENT.
 */
export function explainOutcome(
  snapshot: AllocationInputSnapshot,
  held: ReadonlyMap<JdId, readonly StudentId[]>,
  studentId: StudentId,
): Outcome {
  const keyAt = new Map<string, RankKey>(snapshot.pairs.map((pair) => [`${pair.jdId}:${pair.studentId}`, pair.rankKey]));
  const capacityOf = new Map(snapshot.capacity.map((row) => [row.jdId, row.capacity]));
  const nominatedJdId = [...held].find(([, students]) => students.includes(studentId))?.[0] ?? null;

  const preferences = [
    ...snapshot.pairs.filter((pair) => pair.studentId === studentId).map((pair) => ({ ...pair, excluded: null })),
    ...snapshot.excluded.filter((pair) => pair.studentId === studentId).map((pair) => ({ ...pair, excluded: pair })),
  ].sort((a, b) => a.preferenceRank - b.preferenceRank);
  const heldRank = preferences.find((pair) => pair.jdId === nominatedJdId)?.preferenceRank ?? Number.POSITIVE_INFINITY;

  const items = preferences
    .filter((pair) => pair.preferenceRank < heldRank)
    .map((pair): OutcomeItem => {
      const holders = held.get(pair.jdId) ?? [];
      const capacity = capacityOf.get(pair.jdId) ?? 0;
      const lowest = lowestOf(holders, (student) => keyAt.get(`${pair.jdId}:${student}`));
      const base = {
        jdId: pair.jdId,
        preferenceRank: pair.preferenceRank,
        capacity,
        held: holders.length,
        lowestHeld: lowest ? { studentId: lowest.studentId, studentCode: lowest.key.studentCode, sFinal: lowest.key.sFinal } : null,
      };
      if (pair.excluded) {
        return { ...base, reason: 'NOT_ELIGIBLE', exclusionReasons: [...pair.excluded.reasons], sFinal: pair.excluded.sFinal };
      }
      const own = pair.rankKey;
      return { ...base, reason: reasonAt(own, holders.length, capacity, lowest?.key), exclusionReasons: [], sFinal: own.sFinal };
    });

  return { studentId, nominatedJdId, items };
}

export function studentOutcome(outcome: Outcome): StudentOutcome {
  return {
    nominatedJdId: outcome.nominatedJdId,
    items: outcome.items.map(({ jdId, preferenceRank, reason, exclusionReasons, sFinal }) => ({
      jdId,
      preferenceRank,
      reason,
      exclusionReasons: [...exclusionReasons],
      sFinal,
    })),
  };
}

function reasonAt(own: RankKey, holders: number, capacity: number, lowest: RankKey | undefined): OutcomeReason {
  if (capacity === 0) return 'ZERO_CAPACITY';
  // A free seat, or a holder ranked below the student: the engine would have placed the student.
  if (holders < capacity || lowest === undefined || compareRankKeys(own, lowest) < 0) return 'MANUAL_ADJUSTMENT';
  // BR-16: ranked below the lowest holder only because of the demotion.
  if (own.demoted && !lowest.demoted && compareRankKeys({ ...own, demoted: false }, lowest) < 0) return 'DEMOTED';
  return 'FULL_WITH_HIGHER_RANKED';
}

/**
 * The lowest-ranked of `students` by their rank keys at the JD. A holder with no key there (added
 * by hand outside BR-07, which the service refuses) is skipped.
 */
function lowestOf(
  students: readonly StudentId[],
  keyOf: (student: StudentId) => RankKey | undefined,
): { studentId: StudentId; key: RankKey } | undefined {
  let lowest: { studentId: StudentId; key: RankKey } | undefined;
  for (const studentId of students) {
    const key = keyOf(studentId);
    if (key && (!lowest || compareRankKeys(key, lowest.key) > 0)) lowest = { studentId, key };
  }
  return lowest;
}
