import { InvalidAllocationInputError } from '../errors.js';
import { toCentiScore } from '../score.js';

// US-5.1 AC-7, AGENTS › Invariant 9: numeric(5,2) scores become integers ×100 without float math.
describe('toCentiScore (US-5.1 AC-7)', () => {
  it('toCentiScore parses numeric(5,2) without float math', () => {
    expect(toCentiScore('80.29')).toBe(8029);
    expect(toCentiScore('0.29')).toBe(29);
    expect(toCentiScore('100')).toBe(10000);
    expect(toCentiScore('7.5')).toBe(750);
    expect(toCentiScore(80.29)).toBe(8029);
    expect(toCentiScore(0.07)).toBe(7);
  });

  it.each(['abc', '1.234', '', ' 80', '1.', '.5', '-1', '1e2', '1000'])('toCentiScore rejects %j', (text) => {
    expect(() => toCentiScore(text)).toThrow(InvalidAllocationInputError);
  });

  it.each([-0.5, Number.NaN, Number.POSITIVE_INFINITY, 1e-7])('toCentiScore rejects the number %p', (value) => {
    expect(() => toCentiScore(value)).toThrow(InvalidAllocationInputError);
  });

  it('toCentiScore round-trips every integer in [0, 10000]', () => {
    for (let n = 0; n <= 10_000; n += 1) {
      const text = `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;
      if (toCentiScore(text) !== n || toCentiScore(Number(text)) !== n) throw new Error(`round-trip failed for ${text}`);
    }
  });
});
