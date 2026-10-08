import { CAMPAIGN_STATES, campaignMachine } from '../campaign.js';
import { mismatchedPairs } from './pairs.js';

// PRD GĐ0, read left to right.
const PRD_EDGES = [
  ['DRAFT', 'INTAKE'],
  ['INTAKE', 'PREFERENCE_SELECTION'],
  ['PREFERENCE_SELECTION', 'TESTING'],
  ['TESTING', 'ALLOCATION_REVIEW'],
  ['ALLOCATION_REVIEW', 'SUPPLEMENTARY'],
  ['SUPPLEMENTARY', 'CLOSED'],
] as const;

describe('GĐ0: campaign machine allows only PRD transitions', () => {
  it('accepts exactly the PRD edges among all state pairs', () => {
    expect(CAMPAIGN_STATES).toHaveLength(7);
    expect(mismatchedPairs(campaignMachine, PRD_EDGES)).toEqual([]);
  });

  it('starts in DRAFT and ends in CLOSED', () => {
    expect(campaignMachine.initial).toBe('DRAFT');
    expect(campaignMachine.transitions.CLOSED).toEqual([]);
  });
});
