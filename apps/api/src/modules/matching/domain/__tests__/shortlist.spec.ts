import { meetsCvThreshold, selectShortlist, type ShortlistCandidate } from '../shortlist.js';

const result = (jdId: number, scvX100: number | null, eligible = true): ShortlistCandidate => ({ jdId, eligible, scvX100 });

describe('GĐ3 shortlist (US-3.1 AC-10, CONTEXT D36)', () => {
  it('GĐ3 shortlist: eligible and S_cv >= theta, sorted desc, ties by jdId', () => {
    const results = [
      result(7, 6200),
      result(3, 5000), // exactly θ_cv = 50
      result(9, 4999),
      result(4, 8100, false), // high S_cv but not eligible
      result(5, null), // dropped by the embedding pre-filter: no S_cv
      result(2, 6200),
      result(8, 7350),
    ];
    expect(selectShortlist(results, 50).map((r) => r.jdId)).toEqual([8, 2, 7, 3]);
  });

  it('GĐ3 shortlist: the same list in any order gives the same shortlist', () => {
    const results = [result(1, 6000), result(2, 6000), result(3, 7000)];
    expect(selectShortlist([...results].reverse(), 50)).toEqual(selectShortlist(results, 50));
    expect(selectShortlist(results, 50)).not.toBe(results);
  });

  it('Invariant 9 θ_cv is compared ×100', () => {
    expect(meetsCvThreshold(result(1, 5056), 50.555)).toBe(true);
    expect(meetsCvThreshold(result(1, 5055), 50.555)).toBe(false);
    expect(meetsCvThreshold(result(1, 0), 0)).toBe(true);
    expect(meetsCvThreshold(result(1, null), 0)).toBe(false);
    expect(selectShortlist([], 50)).toEqual([]);
  });
});
