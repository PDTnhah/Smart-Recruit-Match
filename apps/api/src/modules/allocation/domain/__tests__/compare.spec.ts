import fc from 'fast-check';
import { buildCompareAt, compareRankKeys } from '../compare.js';
import { InvalidAllocationInputError } from '../errors.js';
import type { RankKey } from '../types.js';

// US-5.1 AC-5: each level decides only when every level above it ties.
const base: RankKey = {
  demoted: false,
  sFinal: 8029,
  sTest: 7500,
  sCv: 6000,
  gpa: 320,
  submittedAt: 1_000,
  studentCode: 'B21DCCN100',
};
const key = (overrides: Partial<RankKey>): RankKey => ({ ...base, studentCode: 'B21DCCN200', ...overrides });

describe('compareRankKeys (US-5.1 AC-5)', () => {
  it('S_final higher ranks first', () => {
    expect(compareRankKeys(key({ sFinal: 8030, sTest: 0 }), base)).toBeLessThan(0);
  });

  it('S_final tie-break: S_test', () => {
    expect(compareRankKeys(key({ sTest: 7501, sCv: 0 }), base)).toBeLessThan(0);
  });

  it('S_final tie-break: S_cv', () => {
    expect(compareRankKeys(key({ sCv: 6001, gpa: 0 }), base)).toBeLessThan(0);
  });

  it('S_final tie-break: GPA, a missing GPA after any GPA (CONTEXT D63)', () => {
    expect(compareRankKeys(key({ gpa: 321, submittedAt: 9_999 }), base)).toBeLessThan(0);
    expect(compareRankKeys(key({ gpa: null, submittedAt: 0 }), key({ gpa: 0, studentCode: 'Z' }))).toBeGreaterThan(0);
    expect(compareRankKeys(key({ gpa: null, submittedAt: 999 }), { ...base, gpa: null })).toBeLessThan(0);
  });

  it('S_final tie-break: earlier submission', () => {
    expect(compareRankKeys(key({ submittedAt: 999 }), base)).toBeLessThan(0);
  });

  it('S_final tie-break: student_code, smaller first in code-unit order (CONTEXT D63)', () => {
    expect(compareRankKeys(key({ studentCode: 'B21DCCN099' }), base)).toBeLessThan(0);
    expect(compareRankKeys(key({ studentCode: 'b' }), key({ studentCode: 'B' }))).toBeGreaterThan(0);
  });

  it('BR-16 demoted ranks after everyone', () => {
    const demotedTop = key({ demoted: true, sFinal: 10_000, sTest: 10_000, sCv: 10_000, gpa: 400, submittedAt: 0 });
    expect(compareRankKeys(demotedTop, { ...base, sFinal: 0, sTest: 0, sCv: 0, gpa: null })).toBeGreaterThan(0);
    expect(compareRankKeys(demotedTop, key({ demoted: true, sFinal: 9_999 }))).toBeLessThan(0);
  });

  it('never returns 0 for two different students, and is antisymmetric', () => {
    const level = fc.integer({ min: 0, max: 1 });
    const rankKey = fc.record({
      demoted: fc.boolean(),
      sFinal: level,
      sTest: level,
      sCv: level,
      gpa: fc.option(level),
      submittedAt: level,
      studentCode: fc.string({ maxLength: 3 }),
    });
    fc.assert(
      fc.property(rankKey, rankKey, (a, b) => {
        fc.pre(a.studentCode !== b.studentCode);
        const order = compareRankKeys(a, b);
        expect(order).not.toBe(0);
        expect(Math.sign(compareRankKeys(b, a))).toBe(-Math.sign(order));
      }),
      { numRuns: 1000 },
    );
  });
});

describe('buildCompareAt (US-5.1)', () => {
  it('ranks by the rank key at the JD asked', () => {
    const compareAt = buildCompareAt(
      new Map([
        ['A', new Map([['an', key({ sFinal: 8800 })], ['binh', { ...base, sFinal: 9200 }]])],
        ['B', new Map([['an', key({ sFinal: 8000 })], ['binh', { ...base, sFinal: 7500 }]])],
      ]),
    );
    expect(compareAt('A', 'binh', 'an')).toBeLessThan(0);
    expect(compareAt('B', 'binh', 'an')).toBeGreaterThan(0);
    expect(compareAt('A', 'an', 'an')).toBe(0);
    expect(() => compareAt('C', 'an', 'an')).toThrow(InvalidAllocationInputError);
  });

  it('rejects a score not in integers ×100 and a student_code shared by two students', () => {
    expect(() => buildCompareAt(new Map([['A', new Map([['an', key({ sFinal: 80.29 })]])]]))).toThrow(
      InvalidAllocationInputError,
    );
    expect(() => buildCompareAt(new Map([['A', new Map([['an', base], ['binh', base]])]]))).toThrow(
      /belongs to two students/,
    );
    expect(() => buildCompareAt(new Map([['A', new Map([['an', base]])], ['B', new Map([['an', key({})]])]]))).toThrow(
      /two student codes/,
    );
  });

  it('BR-16 rejects a key whose demoted is not a boolean (a field missing from JSON)', () => {
    const withoutDemoted = { ...base, demoted: undefined } as unknown as RankKey;
    const keys = new Map([['an', withoutDemoted], ['binh', key({})]]);
    expect(() => buildCompareAt(new Map([['A', keys]]))).toThrow(/needs demoted/);
  });
});
