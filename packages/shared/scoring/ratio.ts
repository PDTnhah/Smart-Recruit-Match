// Exact non-negative fractions in bigint for the scores code computes: S_cv, skill_fit and zone
// coverage (US-3.1, US-3.5), S_test, part and skill scores, S_final (US-4.4, CONTEXT D53). Each
// score is rounded half-up once at the end, so no result depends on float rounding (AGENTS ›
// Invariant 9).

/** A non-negative fraction; `den` > 0. Not reduced: bigint does not overflow. */
export interface Ratio {
  num: bigint;
  den: bigint;
}

export const ZERO: Ratio = { num: 0n, den: 1n };

export const add = (a: Ratio, b: Ratio): Ratio => ({ num: a.num * b.den + b.num * a.den, den: a.den * b.den });

export const times = (a: Ratio, k: bigint): Ratio => ({ num: a.num * k, den: a.den });

export const over = (a: Ratio, k: bigint): Ratio => ({ num: a.num, den: a.den * k });

export const multiply = (a: Ratio, b: Ratio): Ratio => ({ num: a.num * b.num, den: a.den * b.den });

/** a / b; `b` must not be zero. */
export const divide = (a: Ratio, b: Ratio): Ratio => {
  if (b.num === 0n) throw new Error('ratio: division by zero');
  return { num: a.num * b.den, den: a.den * b.num };
};

/** Half-up rounding of a non-negative fraction to an integer. */
export const roundHalfUp = (a: Ratio): number => Number((2n * a.num + a.den) / (2n * a.den));
