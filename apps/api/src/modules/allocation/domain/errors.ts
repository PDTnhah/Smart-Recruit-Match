// Errors of the allocation engine (US-5.1). Both abort the run: the caller gets no result.

import type { JdId, StudentId } from './types.js';

/** The input breaks the engine's contract: a bad capacity, a JD listed twice, a missing rank key. */
export class InvalidAllocationInputError extends Error {
  override readonly name = 'InvalidAllocationInputError';
}

/** `compareAt` tied two different students at a JD, so the ranking there is not strict (AC-6). */
export class NonStrictComparatorError extends Error {
  override readonly name = 'NonStrictComparatorError';

  constructor(
    readonly jd: JdId,
    readonly a: StudentId,
    readonly b: StudentId,
  ) {
    super(`compareAt is not strict: students ${a} and ${b} tie at JD ${jd}`);
  }
}
