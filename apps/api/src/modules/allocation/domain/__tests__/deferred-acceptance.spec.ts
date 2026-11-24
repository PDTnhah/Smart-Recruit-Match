import { checkStability } from '../check-stability.js';
import { buildCompareAt } from '../compare.js';
import { deferredAcceptance } from '../deferred-acceptance.js';
import { InvalidAllocationInputError, NonStrictComparatorError } from '../errors.js';
import type { AllocationInput, JdId, RankKey, StudentId } from '../types.js';
import { prdExample } from './prd-example.js';

const rankKey = (studentCode: string): RankKey => ({
  demoted: false,
  sFinal: 8000,
  sTest: 7000,
  sCv: 6000,
  gpa: null,
  submittedAt: 0,
  studentCode,
});

/** Every listed (JD, student) pair gets a key; `sv-1` ranks above `sv-2` everywhere. */
function inputOf(preferences: Record<StudentId, JdId[]>, capacity: Record<JdId, number>): AllocationInput {
  const rankKeys = new Map<JdId, Map<StudentId, RankKey>>();
  for (const [student, jds] of Object.entries(preferences)) {
    for (const jd of jds) {
      const keys = rankKeys.get(jd) ?? new Map<StudentId, RankKey>();
      rankKeys.set(jd, keys.set(student, rankKey(student)));
    }
  }
  return {
    preferences: new Map(Object.entries(preferences)),
    capacity: new Map(Object.entries(capacity)),
    compareAt: buildCompareAt(rankKeys),
  };
}

describe('GĐ7 Allocation Engine (US-5.1)', () => {
  it('PRD example: A–Bình; B–Chi, An; C–Dũng', () => {
    const input = prdExample();
    const result = deferredAcceptance(input);

    expect([...result.held]).toEqual([
      ['A', ['Bình']],
      ['B', ['Chi', 'An']],
      ['C', ['Dũng']],
    ]);
    expect(result.unassigned).toEqual([]);
    expect(checkStability(input, result)).toEqual({ ok: true, violations: [] });
  });

  it('a rejected student proposes to the next preference; one with none left waits (GĐ7, BR-09)', () => {
    const result = deferredAcceptance(inputOf({ 'sv-2': ['X', 'Y'], 'sv-1': ['X'], 'sv-3': ['X'] }, { X: 1, Y: 1 }));
    expect([...result.held]).toEqual([
      ['X', ['sv-1']],
      ['Y', ['sv-2']],
    ]);
    expect(result.unassigned).toEqual(['sv-3']);
  });

  it('throws NonStrictComparatorError when compareAt returns 0', () => {
    const input: AllocationInput = {
      preferences: new Map([
        ['sv-1', ['X']],
        ['sv-2', ['X']],
      ]),
      capacity: new Map([['X', 1]]),
      compareAt: () => 0,
    };
    expect(() => deferredAcceptance(input)).toThrow(NonStrictComparatorError);
  });

  describe('edge cases: empty input, no preferences, zero capacity, duplicate JD, missing rank key', () => {
    it('empty input gives an empty result', () => {
      expect(deferredAcceptance(inputOf({}, {}))).toEqual({ held: new Map(), unassigned: [] });
    });

    it('a student with no preference, or only JDs with no seat, is unassigned', () => {
      const result = deferredAcceptance(inputOf({ 'sv-1': [], 'sv-2': ['ZERO', 'MISSING'] }, { ZERO: 0 }));
      expect([...result.held]).toEqual([['ZERO', []]]);
      expect(result.unassigned).toEqual(['sv-1', 'sv-2']);
    });

    it('a JD listed twice by one student throws InvalidAllocationInputError', () => {
      expect(() => deferredAcceptance(inputOf({ 'sv-1': ['X', 'X'] }, { X: 1 }))).toThrow(/lists JD X twice/);
    });

    it('a preference with no rank key throws InvalidAllocationInputError, even when nobody competes', () => {
      const input: AllocationInput = { ...inputOf({ 'sv-1': ['X'] }, { X: 5 }), compareAt: buildCompareAt(new Map()) };
      expect(() => deferredAcceptance(input)).toThrow(InvalidAllocationInputError);
    });

    it.each([-1, 1.5, Number.NaN])('capacity %p throws InvalidAllocationInputError', (seats) => {
      expect(() => deferredAcceptance(inputOf({ 'sv-1': ['X'] }, { X: seats }))).toThrow(InvalidAllocationInputError);
    });
  });
});
