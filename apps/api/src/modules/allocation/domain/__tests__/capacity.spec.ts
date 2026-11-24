import { computeCapacity } from '../capacity.js';
import { InvalidAllocationInputError } from '../errors.js';

// US-5.1 AC-8: C_j(r) = max(0, ⌈(quota − accepted) × k⌉ − inProcess), in integers.
describe('computeCapacity (US-5.1 AC-8)', () => {
  it('GĐ10 C_j(r) uses integer arithmetic (50 × 1.1 = 55)', () => {
    expect(Math.ceil(50 * 1.1)).toBe(56); // the float result this guards against: 55.00000000000001
    expect(computeCapacity({ quota: 50, accepted: 0, inProcess: 0, k: 1.1 })).toBe(55);
    expect(computeCapacity({ quota: 10, accepted: 0, inProcess: 0, k: 1.1 })).toBe(11);
    expect(computeCapacity({ quota: 2, accepted: 0, inProcess: 0, k: 1.5 })).toBe(3);
    expect(computeCapacity({ quota: 3, accepted: 1, inProcess: 1, k: 1.5 })).toBe(2);
    expect(computeCapacity({ quota: 3, accepted: 0, inProcess: 0, k: 1.333 })).toBe(4);
  });

  it('GĐ10 C_j(r) never negative', () => {
    expect(computeCapacity({ quota: 1, accepted: 1, inProcess: 0, k: 1.5 })).toBe(0);
    expect(computeCapacity({ quota: 2, accepted: 0, inProcess: 5, k: 1.5 })).toBe(0);
  });

  it.each([
    { quota: -1, accepted: 0, inProcess: 0, k: 1.5 },
    { quota: 2, accepted: -1, inProcess: 0, k: 1.5 },
    { quota: 2, accepted: 0, inProcess: -1, k: 1.5 },
    { quota: 2, accepted: 0, inProcess: 0, k: -1.5 },
    { quota: 1.5, accepted: 0, inProcess: 0, k: 1.5 },
    { quota: 2, accepted: 3, inProcess: 0, k: 1.5 },
  ])('GĐ10 C_j(r) rejects %o', (input) => {
    expect(() => computeCapacity(input)).toThrow(InvalidAllocationInputError);
  });
});
