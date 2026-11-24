// Strict ranking of students at a JD: S_final, then the tie-breaks of PRD › Điểm tổng hợp (S_final),
// then student_code (US-5.1 AC-5, ARCHITECTURE › Allocation Engine). The caller never sorts.

import { InvalidAllocationInputError, NonStrictComparatorError } from './errors.js';
import type { AllocationInput, JdId, RankKey, StudentId } from './types.js';

type CompareAt = AllocationInput['compareAt'];

/** Code-unit order: the same in every locale and runtime, unlike `localeCompare`. */
export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Negative when `a` ranks above `b`. Best first: not demoted (BR-16) → higher S_final → higher
 * S_test → higher S_cv → higher GPA, a missing GPA last → earlier submission → smaller
 * student_code (CONTEXT D63). Returns 0 only for two keys with the same student_code. Expects
 * well-formed keys, as `buildCompareAt` checks; a NaN score would silently skip its level.
 */
export function compareRankKeys(a: RankKey, b: RankKey): number {
  if (a.demoted !== b.demoted) return a.demoted ? 1 : -1;
  return (
    b.sFinal - a.sFinal ||
    b.sTest - a.sTest ||
    b.sCv - a.sCv ||
    compareGpa(a.gpa, b.gpa) ||
    a.submittedAt - b.submittedAt ||
    compareCodeUnits(a.studentCode, b.studentCode)
  );
}

function compareGpa(a: number | null, b: number | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return b - a;
}

/**
 * `compareAt` for the engine from each JD's rank keys. Throws `InvalidAllocationInputError` for a
 * key that is not in integers ×100 or lacks a boolean `demoted` or a student_code, for a student_code
 * shared by two students, and (when called) for a student with no key at the JD.
 */
export function buildCompareAt(rankKeys: ReadonlyMap<JdId, ReadonlyMap<StudentId, RankKey>>): CompareAt {
  validateRankKeys(rankKeys);
  const keyOf = (jd: JdId, student: StudentId): RankKey => {
    const key = rankKeys.get(jd)?.get(student);
    if (!key) throw new InvalidAllocationInputError(`no rank key for student ${student} at JD ${jd}`);
    return key;
  };
  return (jd, a, b) => {
    const keyA = keyOf(jd, a);
    return a === b ? 0 : compareRankKeys(keyA, keyOf(jd, b));
  };
}

function validateRankKeys(rankKeys: ReadonlyMap<JdId, ReadonlyMap<StudentId, RankKey>>): void {
  const codeOf = new Map<StudentId, string>();
  const studentOf = new Map<string, StudentId>();
  for (const [jd, keys] of rankKeys) {
    for (const [student, key] of keys) {
      const integers = [key.sFinal, key.sTest, key.sCv, key.submittedAt, ...(key.gpa === null ? [] : [key.gpa])];
      if (!integers.every(Number.isSafeInteger)) {
        throw new InvalidAllocationInputError(`rank key of student ${student} at JD ${jd} is not in integers ×100`);
      }
      // A non-boolean `demoted` (a field missing from JSON) makes compareRankKeys answer -1 both ways.
      if (typeof key.demoted !== 'boolean' || typeof key.studentCode !== 'string' || key.studentCode === '') {
        throw new InvalidAllocationInputError(`rank key of student ${student} at JD ${jd} needs demoted and a student code`);
      }
      if ((codeOf.get(student) ?? key.studentCode) !== key.studentCode) {
        throw new InvalidAllocationInputError(`student ${student} has two student codes`);
      }
      if ((studentOf.get(key.studentCode) ?? student) !== student) {
        throw new InvalidAllocationInputError(`student code ${key.studentCode} belongs to two students`);
      }
      codeOf.set(student, key.studentCode);
      studentOf.set(key.studentCode, student);
    }
  }
}

/** Wraps `compareAt` so a tie between two different students throws instead of ranking by chance. */
export function strictCompareAt(compareAt: CompareAt): CompareAt {
  return (jd, a, b) => {
    const order = compareAt(jd, a, b);
    if (a !== b && !(order < 0 || order > 0)) throw new NonStrictComparatorError(jd, a, b);
    return order;
  };
}
