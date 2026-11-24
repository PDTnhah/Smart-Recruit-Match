// Data of the allocation engine (US-5.1, ARCHITECTURE › Allocation Engine). Plain values only: the
// engine knows no DB row, campaign or clock, so its result depends on its input alone
// (AGENTS › Invariant 9).

export type StudentId = string;
export type JdId = string;

export interface AllocationInput {
  /**
   * Valid preferences of each student, NV1 first. The caller has already applied BR-07 (hard
   * conditions, θ_cv, θ_test) and removed pairs that ended (BR-12).
   */
  preferences: ReadonlyMap<StudentId, readonly JdId[]>;
  /** C_j of the round (`computeCapacity`). A JD missing here has capacity 0. */
  capacity: ReadonlyMap<JdId, number>;
  /**
   * Negative when `a` ranks above `b` at `jd`. Returns 0 for `(jd, a, a)` and never for two
   * different students. May throw for a pair it cannot rank: the engine asks `(jd, a, a)` for every
   * preference before running, so `buildCompareAt` rejects a missing rank key up front.
   */
  compareAt: (jd: JdId, a: StudentId, b: StudentId) => number;
}

/** Nominations of one round. */
export interface AllocationResult {
  /** Every JD of `capacity`, in JdId order; each list best-ranked first. */
  held: Map<JdId, StudentId[]>;
  /** Students who hold no JD after trying every preference (the waiting list), in StudentId order. */
  unassigned: StudentId[];
}

/** What a JD ranks a student by. Scores are integers ×100 (`toCentiScore`). */
export interface RankKey {
  /** BR-16: a demoted student ranks after every student who is not. */
  demoted: boolean;
  sFinal: number;
  sTest: number;
  sCv: number;
  /** 4-point GPA ×100; null when the CV has none, which ranks after any GPA (CONTEXT D63). */
  gpa: number | null;
  /** Epoch ms of the test submitted for this JD, passed in by the caller. */
  submittedAt: number;
  /** Unique per student; the last tie-break, smaller first in code-unit order (CONTEXT D63). */
  studentCode: string;
}
