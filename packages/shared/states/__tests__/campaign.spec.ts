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

// PRD GĐ0 › Sửa, hủy, xóa đợt (FR-41, CONTEXT D56): an open campaign may be cancelled in any phase.
const CANCEL_EDGES = (['INTAKE', 'PREFERENCE_SELECTION', 'TESTING', 'ALLOCATION_REVIEW', 'SUPPLEMENTARY'] as const).map(
  (from) => [from, 'CANCELLED'] as const,
);

describe('GĐ0: campaign machine allows only PRD transitions', () => {
  it('accepts exactly the PRD edges among all state pairs', () => {
    expect(CAMPAIGN_STATES).toHaveLength(8);
    expect(mismatchedPairs(campaignMachine, [...PRD_EDGES, ...CANCEL_EDGES])).toEqual([]);
  });

  it('starts in DRAFT and ends in CLOSED', () => {
    expect(campaignMachine.initial).toBe('DRAFT');
    expect(campaignMachine.transitions.CLOSED).toEqual([]);
  });

  it('FR-41: CANCELLED is final; a draft cannot be cancelled', () => {
    expect(campaignMachine.transitions.CANCELLED).toEqual([]);
    expect(campaignMachine.transitions.DRAFT).not.toContain('CANCELLED');
  });
});
