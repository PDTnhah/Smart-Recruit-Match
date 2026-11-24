// Deferred Acceptance, students proposing (PRD › Thuật toán phân bổ, ARCHITECTURE › Allocation
// Engine, AD-7). The loop follows the ARCHITECTURE sample; each JD keeps its held list sorted and
// places a proposer by binary search instead of sorting the list again.

import { assertCapacity } from './capacity.js';
import { compareCodeUnits, strictCompareAt } from './compare.js';
import { InvalidAllocationInputError } from './errors.js';
import type { AllocationInput, AllocationResult, JdId, StudentId } from './types.js';

/**
 * Nominations of one round: at most one JD per student, at most C_j students per JD, no blocking
 * pair. The result depends only on the input's content, not on Map insertion order (AC-4). Throws
 * `InvalidAllocationInputError` for a bad input and `NonStrictComparatorError` when `compareAt` ties
 * two different students; no result is returned in either case.
 */
export function deferredAcceptance(input: AllocationInput): AllocationResult {
  validateInput(input);
  const { preferences, capacity } = input;
  const compareAt = strictCompareAt(input.compareAt);

  const nextChoice = new Map<StudentId, number>();
  const held = new Map<JdId, StudentId[]>();
  const unassigned: StudentId[] = [];
  // A stack popped from the smallest StudentId, so the proposal order is fixed by the content too.
  const free = [...preferences.keys()].sort(compareCodeUnits).reverse();

  for (let student = free.pop(); student !== undefined; student = free.pop()) {
    const choice = nextChoice.get(student) ?? 0;
    const jd = preferences.get(student)?.[choice];
    if (jd === undefined) {
      unassigned.push(student); // no preference left: waiting list
      continue;
    }
    nextChoice.set(student, choice + 1);

    const seats = capacity.get(jd) ?? 0;
    if (seats === 0) {
      free.push(student);
      continue;
    }
    const list = held.get(jd) ?? [];
    list.splice(insertionIndex(list, (other) => compareAt(jd, student, other)), 0, student);
    free.push(...list.splice(seats)); // the lowest-ranked is rejected and proposes to its next choice
    held.set(jd, list);
  }

  const result = new Map<JdId, StudentId[]>();
  for (const jd of [...capacity.keys()].sort(compareCodeUnits)) result.set(jd, held.get(jd) ?? []);
  return { held: result, unassigned: unassigned.sort(compareCodeUnits) };
}

/** First position whose student ranks below the proposer; `rankAgainst(other)` < 0 means above. */
function insertionIndex(list: readonly StudentId[], rankAgainst: (other: StudentId) => number): number {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (rankAgainst(list[middle] as StudentId) < 0) high = middle;
    else low = middle + 1;
  }
  return low;
}

function validateInput({ preferences, capacity, compareAt }: AllocationInput): void {
  assertCapacity(capacity);
  for (const [student, jds] of preferences) {
    const seen = new Set<JdId>();
    for (const jd of jds) {
      if (seen.has(jd)) throw new InvalidAllocationInputError(`student ${student} lists JD ${jd} twice`);
      seen.add(jd);
      // Lets compareAt reject a pair it cannot rank (buildCompareAt: no rank key) before any proposal.
      if (compareAt(jd, student, student) !== 0) {
        throw new InvalidAllocationInputError(`compareAt(${jd}, ${student}, ${student}) must be 0`);
      }
    }
  }
}
