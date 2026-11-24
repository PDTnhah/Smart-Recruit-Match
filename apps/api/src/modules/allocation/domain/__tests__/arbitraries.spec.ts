import fc from 'fast-check';
import { deferredAcceptance } from '../deferred-acceptance.js';
import { arbAllocationInput } from './arbitraries.js';

// US-5.1 AC-13: the shared generator only produces inputs the engine accepts (AC-10).
describe('arbAllocationInput (US-5.1 AC-13)', () => {
  it('arbAllocationInput always produces valid input', () => {
    fc.assert(
      fc.property(arbAllocationInput(), ({ input, rankKeys }) => {
        expect(() => deferredAcceptance(input)).not.toThrow();
        for (const [student, jds] of input.preferences) {
          for (const jd of jds) expect(rankKeys.get(jd)?.has(student)).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('arbAllocationInput respects its options', () => {
    const options = { maxStudents: 5, maxJds: 3, maxPreferences: 1, maxCapacity: 2, demotedRate: 0 };
    fc.assert(
      fc.property(arbAllocationInput(options), ({ input, rankKeys }) => {
        expect(input.preferences.size).toBeLessThanOrEqual(5);
        expect(rankKeys.size).toBeLessThanOrEqual(3);
        for (const jds of input.preferences.values()) expect(jds.length).toBeLessThanOrEqual(1);
        for (const seats of input.capacity.values()) expect(seats).toBeLessThanOrEqual(2);
        for (const keys of rankKeys.values()) for (const key of keys.values()) expect(key.demoted).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});
