import { checkStability } from '../check-stability.js';
import { buildCompareAt } from '../compare.js';
import { InvalidAllocationInputError } from '../errors.js';
import type { AllocationInput, JdId, StudentId } from '../types.js';
import { prdExample } from './prd-example.js';

// US-5.1 AC-9: results broken on purpose, one kind at a time; each reports exactly its violation.
const held = (entries: Record<JdId, StudentId[]>) => ({ held: new Map(Object.entries(entries)) });

/** One student `s1` listing `preferences`; every pair it lists has a rank key. */
function single(preferences: JdId[], capacity: Record<JdId, number>): AllocationInput {
  const key = { demoted: false, sFinal: 0, sTest: 0, sCv: 0, gpa: null, submittedAt: 0, studentCode: 's1' };
  return {
    preferences: new Map([['s1', preferences]]),
    capacity: new Map(Object.entries(capacity)),
    compareAt: buildCompareAt(new Map(preferences.map((jd) => [jd, new Map([['s1', key]])]))),
  };
}

describe('checkStability (US-5.1 AC-9)', () => {
  it('detects OVER_CAPACITY', () => {
    const report = checkStability(prdExample(), held({ A: ['Bình'], B: ['Chi', 'An', 'Dũng'], C: [] }));
    expect(report).toEqual({ ok: false, violations: [{ type: 'OVER_CAPACITY', jd: 'B', held: 3, capacity: 2 }] });
  });

  it('detects NOT_IN_PREFERENCES', () => {
    const report = checkStability(single(['X'], { X: 0, Y: 1 }), held({ X: [], Y: ['s1'] }));
    expect(report).toEqual({ ok: false, violations: [{ type: 'NOT_IN_PREFERENCES', student: 's1', jd: 'Y' }] });
  });

  it('detects DUPLICATE_ASSIGNMENT', () => {
    const report = checkStability(single(['X', 'Y'], { X: 1, Y: 1 }), held({ X: ['s1'], Y: ['s1'] }));
    expect(report).toEqual({
      ok: false,
      violations: [{ type: 'DUPLICATE_ASSIGNMENT', student: 's1', jds: ['X', 'Y'] }],
    });
  });

  it('detects BLOCKING_PAIR', () => {
    // An (80 at B) waits while B holds Dũng (65).
    const outranked = checkStability(prdExample(), held({ A: ['Bình'], B: ['Chi', 'Dũng'], C: [] }));
    expect(outranked).toEqual({
      ok: false,
      violations: [{ type: 'BLOCKING_PAIR', student: 'An', jd: 'B', outranks: 'Dũng' }],
    });

    // s1 sits at its NV2 while its NV1 has a free seat.
    const freeSeat = checkStability(single(['X', 'Y'], { X: 1, Y: 1 }), held({ X: [], Y: ['s1'] }));
    expect(freeSeat).toEqual({
      ok: false,
      violations: [{ type: 'BLOCKING_PAIR', student: 's1', jd: 'X', outranks: null }],
    });
  });

  it('BLOCKING_PAIR names the holder who did not list the JD instead of reporting a free seat', () => {
    // Manual adjustment put z, who never listed X, on X's only seat; s1 listed X first.
    const report = checkStability(single(['X', 'Y'], { X: 1, Y: 1 }), held({ X: ['z'], Y: ['s1'] }));
    expect(report).toEqual({
      ok: false,
      violations: [
        { type: 'BLOCKING_PAIR', student: 's1', jd: 'X', outranks: 'z' },
        { type: 'NOT_IN_PREFERENCES', student: 'z', jd: 'X' },
      ],
    });
  });

  it.each([Number.NaN, -1, 1.5])('capacity %p throws InvalidAllocationInputError instead of passing', (seats) => {
    expect(() => checkStability(single(['X'], { X: seats }), held({ X: ['s1'] }))).toThrow(InvalidAllocationInputError);
  });
});
