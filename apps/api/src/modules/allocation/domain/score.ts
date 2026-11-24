// Scores stored as numeric(5,2) become integers ×100 before any comparison (AGENTS › Invariant 9).
// The digits are read from the decimal text, never multiplied as a float.

import { InvalidAllocationInputError } from './errors.js';

/** numeric(5,2): up to three integer digits and two decimals, no sign. */
const NUMERIC_5_2 = /^(\d{1,3})(?:\.(\d{1,2}))?$/;

/**
 * `"80.29"` → 8029, `"7.5"` → 750, `100` → 10000. Drizzle's `mode: 'number'` columns hand over a
 * number, whose shortest text (`String`) is the stored decimal. Throws for anything else: a sign,
 * an exponent, a third decimal, an empty string.
 */
export function toCentiScore(value: string | number): number {
  const match = typeof value === 'number' && !Number.isFinite(value) ? null : NUMERIC_5_2.exec(String(value));
  const whole = match?.[1];
  if (whole === undefined) {
    throw new InvalidAllocationInputError(`not a numeric(5,2) score: ${JSON.stringify(value)}`);
  }
  return Number(whole) * 100 + Number((match?.[2] ?? '').padEnd(2, '0'));
}
