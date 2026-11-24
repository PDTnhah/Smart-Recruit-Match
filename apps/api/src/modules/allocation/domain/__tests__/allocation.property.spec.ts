import fc from 'fast-check';
import { checkStability } from '../check-stability.js';
import { deferredAcceptance } from '../deferred-acceptance.js';
import type { AllocationResult } from '../types.js';
import { arbAllocationInput } from './arbitraries.js';

// US-5.1 AC-2…AC-4, AGENTS › Testing: the three properties of the engine on random inputs. A failure
// prints fast-check's `seed` and `path`; pass them back as `{ seed, path }` in the options to replay it.
const RUNS = { numRuns: 1000 };

const snapshot = ({ held, unassigned }: AllocationResult) => ({ held: [...held], unassigned });

describe('Allocation Engine properties (US-5.1)', () => {
  it('GĐ7 property: result is always stable (no blocking pair)', () => {
    fc.assert(
      fc.property(arbAllocationInput(), ({ input }) => {
        expect(checkStability(input, deferredAcceptance(input))).toEqual({ ok: true, violations: [] });
      }),
      RUNS,
    );
  });

  it('BR-09 property: no JD exceeds capacity; each student holds at most one JD from own preferences', () => {
    fc.assert(
      fc.property(arbAllocationInput(), ({ input }) => {
        const { held, unassigned } = deferredAcceptance(input);
        const holders: string[] = [];
        for (const [jd, students] of held) {
          expect(students.length).toBeLessThanOrEqual(input.capacity.get(jd) ?? 0);
          for (const student of students) expect(input.preferences.get(student)).toContain(jd);
          holders.push(...students);
        }
        expect(new Set(holders).size).toBe(holders.length);
        // every student is either nominated or waiting, never both
        expect([...holders, ...unassigned].sort()).toEqual([...input.preferences.keys()].sort());
      }),
      RUNS,
    );
  });

  it('GĐ7 property: deterministic under repeated runs and insertion-order permutation', () => {
    const scenario = arbAllocationInput().chain((generated) => {
      const students = [...generated.input.preferences.keys()];
      const jds = [...generated.input.capacity.keys()];
      return fc.record({
        generated: fc.constant(generated),
        students: fc.shuffledSubarray(students, { minLength: students.length, maxLength: students.length }),
        jds: fc.shuffledSubarray(jds, { minLength: jds.length, maxLength: jds.length }),
      });
    });
    fc.assert(
      fc.property(scenario, ({ generated: { input }, students, jds }) => {
        const first = snapshot(deferredAcceptance(input));
        const permuted = {
          ...input,
          preferences: new Map(students.map((student) => [student, input.preferences.get(student) ?? []])),
          capacity: new Map(jds.map((jd) => [jd, input.capacity.get(jd) ?? 0])),
        };
        expect(snapshot(deferredAcceptance(input))).toEqual(first);
        expect(snapshot(deferredAcceptance(permuted))).toEqual(first);
        // each list is in rank order at its JD
        for (const [jd, list] of first.held) {
          for (let i = 1; i < list.length; i += 1) {
            expect(input.compareAt(jd, list[i - 1] as string, list[i] as string)).toBeLessThan(0);
          }
        }
      }),
      RUNS,
    );
  });
});
