// Checks a round's nominations after every run, and after manual adjustments (AGENTS › Invariant 9,
// BR-09, ARCHITECTURE › Allocation Engine). Judges `held` only; `unassigned` is derived from it.

import { assertCapacity } from './capacity.js';
import { compareCodeUnits, strictCompareAt } from './compare.js';
import type { AllocationInput, JdId, StudentId } from './types.js';

export type StabilityViolation =
  | { type: 'OVER_CAPACITY'; jd: JdId; held: number; capacity: number }
  | { type: 'NOT_IN_PREFERENCES'; student: StudentId; jd: JdId }
  | { type: 'DUPLICATE_ASSIGNMENT'; student: StudentId; jds: JdId[] }
  /**
   * `outranks` is the student `student` would displace: a holder who did not list `jd` (smallest
   * StudentId of them), else the lowest-ranked holder. Null only when `jd` has a free seat.
   */
  | { type: 'BLOCKING_PAIR'; student: StudentId; jd: JdId; outranks: StudentId | null };

export interface StabilityReport {
  ok: boolean;
  /** JDs in JdId order, then students in StudentId order. */
  violations: StabilityViolation[];
}

/** Throws `InvalidAllocationInputError` for a capacity that is not a non-negative integer. */
export function checkStability(
  input: AllocationInput,
  result: { held: ReadonlyMap<JdId, readonly StudentId[]> },
): StabilityReport {
  assertCapacity(input.capacity); // a NaN seat count would pass every capacity comparison
  const compareAt = strictCompareAt(input.compareAt);
  const preferencesOf = (student: StudentId) => input.preferences.get(student) ?? [];
  const violations: StabilityViolation[] = [];

  const assigned = new Map<StudentId, JdId[]>();
  for (const jd of [...result.held.keys()].sort(compareCodeUnits)) {
    const list = result.held.get(jd) ?? [];
    const seats = input.capacity.get(jd) ?? 0;
    if (list.length > seats) violations.push({ type: 'OVER_CAPACITY', jd, held: list.length, capacity: seats });
    for (const student of list) {
      const jds = assigned.get(student);
      if (jds) jds.push(jd);
      else assigned.set(student, [jd]);
    }
  }

  // Seats a JD has given, and the holder a proposer would displace. A holder who did not list the JD
  // is reported above and has no rank key there: it ranks below anyone who listed the JD.
  const standing = new Map<JdId, { taken: number; lowest: StudentId | undefined; unlisted: boolean }>();
  const standingAt = (jd: JdId) => {
    let entry = standing.get(jd);
    if (!entry) {
      const list = result.held.get(jd) ?? [];
      const unlisted = list.filter((student) => !preferencesOf(student).includes(jd)).sort(compareCodeUnits);
      const lowest =
        unlisted[0] ??
        list.reduce<StudentId | undefined>(
          (low, student) => (low === undefined || compareAt(jd, student, low) > 0 ? student : low),
          undefined,
        );
      entry = { taken: list.length, lowest, unlisted: unlisted.length > 0 };
      standing.set(jd, entry);
    }
    return entry;
  };

  const students = [...new Set([...input.preferences.keys(), ...assigned.keys()])].sort(compareCodeUnits);
  for (const student of students) {
    const preferences = preferencesOf(student);
    const jds = assigned.get(student) ?? [];
    if (jds.length > 1) violations.push({ type: 'DUPLICATE_ASSIGNMENT', student, jds });
    for (const jd of jds) {
      if (!preferences.includes(jd)) violations.push({ type: 'NOT_IN_PREFERENCES', student, jd });
    }
    // Every preference above the best one the student holds; all of them when it holds none.
    const ranks = jds.map((jd) => preferences.indexOf(jd)).filter((rank) => rank >= 0);
    for (const jd of preferences.slice(0, Math.min(preferences.length, ...ranks))) {
      const { taken, lowest, unlisted } = standingAt(jd);
      if (taken < (input.capacity.get(jd) ?? 0)) {
        violations.push({ type: 'BLOCKING_PAIR', student, jd, outranks: null });
      } else if (lowest !== undefined && (unlisted || compareAt(jd, student, lowest) < 0)) {
        violations.push({ type: 'BLOCKING_PAIR', student, jd, outranks: lowest });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
