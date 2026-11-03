// Exact non-negative fractions in bigint for the matching scores (S_cv, skill_fit, zone coverage),
// rounded half-up once at the end, so no result depends on float rounding.

/** A non-negative fraction; `den` > 0. Not reduced: bigint does not overflow. */
export interface Ratio {
  num: bigint;
  den: bigint;
}

export const ZERO: Ratio = { num: 0n, den: 1n };

export const add = (a: Ratio, b: Ratio): Ratio => ({ num: a.num * b.den + b.num * a.den, den: a.den * b.den });

export const times = (a: Ratio, k: bigint): Ratio => ({ num: a.num * k, den: a.den });

export const over = (a: Ratio, k: bigint): Ratio => ({ num: a.num, den: a.den * k });

/** Half-up rounding of a non-negative fraction to an integer. */
export const roundHalfUp = (a: Ratio): number => Number((2n * a.num + a.den) / (2n * a.den));
