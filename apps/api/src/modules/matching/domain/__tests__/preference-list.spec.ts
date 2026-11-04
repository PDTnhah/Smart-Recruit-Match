import { autoAssignedPreferences, checkPreferenceList, fullPreferenceCount, type PreferenceRules } from '../preference-list.js';

const rules = (overrides: Partial<PreferenceRules> = {}): PreferenceRules => ({
  nNv: 3,
  shortlistJdIds: [30, 10, 20, 40],
  requireFull: false,
  ...overrides,
});

const list = (...jdIds: number[]) => jdIds.map((jdId, index) => ({ jdId, rank: index + 1 }));

describe('GĐ4 preference list rules (US-3.3 AC-6, AC-8, BR-04)', () => {
  it('BR-04 accepts 1…N_NV distinct shortlist JDs ranked from 1, in any order of the array', () => {
    expect(checkPreferenceList(list(10), rules())).toEqual({ ok: true });
    expect(checkPreferenceList(list(40, 30, 20), rules())).toEqual({ ok: true });
    const shuffled = [
      { jdId: 20, rank: 3 },
      { jdId: 30, rank: 1 },
      { jdId: 10, rank: 2 },
    ];
    expect(checkPreferenceList(shuffled, rules())).toEqual({ ok: true });
  });

  it('BR-04 an empty list is valid unless a full list is required', () => {
    expect(checkPreferenceList([], rules())).toEqual({ ok: true });
    expect(checkPreferenceList([], rules({ requireFull: true }))).toEqual({ ok: false, code: 'PREFERENCES_INCOMPLETE' });
    // Nothing to choose from: an empty list is full.
    expect(checkPreferenceList([], rules({ requireFull: true, shortlistJdIds: [] }))).toEqual({ ok: true });
  });

  it('BR-04 rejects over N_NV, outside shortlist, duplicates, gaps in rank', () => {
    expect(checkPreferenceList(list(10, 20, 30, 40), rules())).toEqual({ ok: false, code: 'PREFERENCES_TOO_MANY' });
    expect(checkPreferenceList(list(10, 99, 98), rules())).toEqual({
      ok: false,
      code: 'PREFERENCE_NOT_IN_SHORTLIST',
      jdIds: [99, 98],
    });
    expect(checkPreferenceList(list(10, 10), rules())).toEqual({ ok: false, code: 'PREFERENCE_DUPLICATE_JD' });
    const gap = [
      { jdId: 10, rank: 1 },
      { jdId: 20, rank: 3 },
    ];
    expect(checkPreferenceList(gap, rules())).toEqual({ ok: false, code: 'PREFERENCE_RANK_NOT_CONTIGUOUS' });
    const fromTwo = [{ jdId: 10, rank: 2 }];
    expect(checkPreferenceList(fromTwo, rules())).toEqual({ ok: false, code: 'PREFERENCE_RANK_NOT_CONTIGUOUS' });
    const sameRank = [
      { jdId: 10, rank: 1 },
      { jdId: 20, rank: 1 },
    ];
    expect(checkPreferenceList(sameRank, rules())).toEqual({ ok: false, code: 'PREFERENCE_RANK_NOT_CONTIGUOUS' });
  });

  it('GĐ4 require_full_preferences asks for min(N_NV, shortlist size)', () => {
    expect(checkPreferenceList(list(10, 20), rules({ requireFull: true }))).toEqual({
      ok: false,
      code: 'PREFERENCES_INCOMPLETE',
    });
    expect(checkPreferenceList(list(10, 20, 30), rules({ requireFull: true }))).toEqual({ ok: true });
    // A shortlist shorter than N_NV: all of it is enough.
    expect(checkPreferenceList(list(30, 10), rules({ requireFull: true, shortlistJdIds: [10, 30] }))).toEqual({ ok: true });
    expect(fullPreferenceCount({ nNv: 3, shortlistJdIds: [1] })).toBe(1);
    expect(fullPreferenceCount({ nNv: 3, shortlistJdIds: [1, 2, 3, 4, 5] })).toBe(3);
  });

  it('GĐ4 Q6 assigns the first min(N_NV, shortlist size) JDs of the shortlist in its order', () => {
    expect(autoAssignedPreferences({ nNv: 3, shortlistJdIds: [30, 10, 20, 40] })).toEqual(list(30, 10, 20));
    expect(autoAssignedPreferences({ nNv: 3, shortlistJdIds: [40] })).toEqual(list(40));
    expect(autoAssignedPreferences({ nNv: 3, shortlistJdIds: [] })).toEqual([]);
    // What Q6 assigns always passes the rules of a full list.
    const shortlistJdIds = [30, 10, 20, 40];
    expect(checkPreferenceList(autoAssignedPreferences({ nNv: 3, shortlistJdIds }), rules({ requireFull: true }))).toEqual({
      ok: true,
    });
  });
});
