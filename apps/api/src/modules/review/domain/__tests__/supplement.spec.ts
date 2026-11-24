// GĐ8 step 3 (FR-29, US-5.3 AC-9): HR asks for more candidates only while fewer were invited than
// the quota, once per published round.
import { type SupplementFacts, supplementBlock } from '../supplement.js';

const open: SupplementFacts = { phaseOpen: true, hasPublishedRound: true, alreadyRequested: false, invitedCount: 1, quota: 2 };

describe('GĐ8 supplement request rules (US-5.3 AC-9)', () => {
  it('allows a request while invited < quota', () => {
    expect(supplementBlock(open)).toBeNull();
  });

  it.each([
    ['campaign out of review', { phaseOpen: false }, 'PHASE_CLOSED'],
    ['no round published yet', { hasPublishedRound: false }, 'NO_PUBLISHED_ROUND'],
    ['invited = quota', { invitedCount: 2 }, 'QUOTA_REACHED'],
    ['already asked in the round', { alreadyRequested: true }, 'ALREADY_REQUESTED'],
  ] as const)('blocks when %s', (_name, change, expected) => {
    expect(supplementBlock({ ...open, ...change })).toBe(expected);
  });
});
