// Capacity of a JD in round r (PRD GĐ10): C_j(r) = max(0, ⌈(quota − accepted) × k⌉ − inProcess).
// Round 1 is the same formula with accepted = inProcess = 0, i.e. C_j = ⌈quota × k⌉.

import { InvalidAllocationInputError } from './errors.js';
import type { JdId } from './types.js';

export interface CapacityInput {
  quota: number;
  /** Students who accepted an offer of this JD. */
  accepted: number;
  /** Nominations still running: INTERVIEW, PASSED, RESERVE. */
  inProcess: number;
  /** `campaigns.config.k`. */
  k: number;
}

/** Integer arithmetic only: k is read as its exact decimal (`1.1` = 11/10), so 10 × 1.1 gives 11, not 12. */
export function computeCapacity({ quota, accepted, inProcess, k }: CapacityInput): number {
  for (const [name, value] of Object.entries({ quota, accepted, inProcess })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new InvalidAllocationInputError(`${name} must be a non-negative integer, got ${value}`);
    }
  }
  if (accepted > quota) throw new InvalidAllocationInputError(`accepted (${accepted}) exceeds quota (${quota})`);
  const { num, den } = exactDecimal(k);
  const seats = (BigInt(quota - accepted) * num + den - 1n) / den; // ceiling of a non-negative fraction
  return Math.max(0, Number(seats) - inProcess);
}

/** Every seat count is a non-negative integer, as `computeCapacity` returns; else no seat count can be trusted. */
export function assertCapacity(capacity: ReadonlyMap<JdId, number>): void {
  for (const [jd, seats] of capacity) {
    if (!Number.isSafeInteger(seats) || seats < 0) {
      throw new InvalidAllocationInputError(`capacity of JD ${jd} must be a non-negative integer, got ${seats}`);
    }
  }
}

function exactDecimal(value: number): { num: bigint; den: bigint } {
  const match = Number.isFinite(value) ? /^(\d+)(?:\.(\d+))?$/.exec(String(value)) : null;
  const whole = match?.[1];
  if (whole === undefined) throw new InvalidAllocationInputError(`k must be a non-negative decimal, got ${value}`);
  const fraction = match?.[2] ?? '';
  return { num: BigInt(whole + fraction), den: 10n ** BigInt(fraction.length) };
}
