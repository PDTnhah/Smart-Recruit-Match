import { add, divide, multiply, over, roundHalfUp, times, ZERO } from '../index.js';

const r = (num: bigint, den: bigint) => ({ num, den });

describe('Invariant 9: exact fractions, rounded half-up once', () => {
  it('adds, scales and divides without float rounding', () => {
    // 1/3 + 1/6 = 1/2, × 100 = 50.
    expect(roundHalfUp(times(add(r(1n, 3n), r(1n, 6n)), 100n))).toBe(50);
    expect(roundHalfUp(over(r(300n, 1n), 4n))).toBe(75);
    expect(roundHalfUp(divide(r(2n, 3n), r(1n, 3n)))).toBe(2);
    // 2/3 × 3/4 = 1/2, × 100 = 50.
    expect(roundHalfUp(times(multiply(r(2n, 3n), r(3n, 4n)), 100n))).toBe(50);
    expect(roundHalfUp(ZERO)).toBe(0);
  });

  it('rounds half up, and below half down', () => {
    expect(roundHalfUp(r(5n, 2n))).toBe(3);
    expect(roundHalfUp(r(7n, 2n))).toBe(4);
    expect(roundHalfUp(r(2_499n, 1_000n))).toBe(2);
    // 0.1 + 0.2 in floats is 0.30000000000000004; × 1000 here is exactly 300.
    expect(roundHalfUp(times(add(r(1n, 10n), r(2n, 10n)), 1_000n))).toBe(300);
  });

  it('refuses a division by zero', () => {
    expect(() => divide(r(1n, 2n), ZERO)).toThrow('division by zero');
  });
});
