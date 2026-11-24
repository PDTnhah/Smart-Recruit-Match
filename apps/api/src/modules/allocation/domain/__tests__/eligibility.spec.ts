import { type CandidatePair, filterEligible } from '../eligibility.js';

// US-5.2 AC-2 (BR-07): θ_cv = 50, θ_test = 40, as integers ×100.
const THRESHOLDS = { thetaCv: 5000, thetaTest: 4000 };
const pair = (overrides: Partial<CandidatePair>): CandidatePair => ({
  studentId: '1',
  jdId: '10',
  preferenceRank: 1,
  hardFilter: { eligible: true, codes: [] },
  sCv: 6000,
  sTest: 5000,
  sFinal: 5400,
  ...overrides,
});

describe('filterEligible (US-5.2 AC-2)', () => {
  it('BR-07 excludes hard-filter, below θ_cv, below θ_test (boundary)', () => {
    const { eligible, excluded } = filterEligible(
      [
        pair({ jdId: 'ok' }),
        pair({ jdId: 'at-theta', sTest: 4000 }),
        pair({ jdId: 'just-below', sTest: 3999 }),
        pair({ jdId: 'hard', hardFilter: { eligible: false, codes: ['GPA_BELOW_MIN'] } }),
        pair({ jdId: 'cv', sCv: 4999 }),
        pair({ jdId: 'no-test', sTest: null, sFinal: null }),
      ],
      THRESHOLDS,
    );
    expect(eligible.map((p) => p.jdId)).toEqual(['ok', 'at-theta']);
    expect(excluded.map((p) => [p.jdId, p.reasons])).toEqual([
      ['just-below', ['BELOW_THETA_TEST']],
      ['hard', ['HARD_FILTER']],
      ['cv', ['BELOW_THETA_CV']],
      ['no-test', ['TEST_NOT_TAKEN']],
    ]);
  });

  it('a pair failing several rules keeps every reason', () => {
    const { excluded } = filterEligible(
      [pair({ hardFilter: { eligible: false, codes: ['MAJOR_NOT_ALLOWED'] }, sCv: null, sTest: 100 })],
      THRESHOLDS,
    );
    expect(excluded[0]?.reasons).toEqual(['HARD_FILTER', 'BELOW_THETA_CV', 'BELOW_THETA_TEST']);
  });
});
