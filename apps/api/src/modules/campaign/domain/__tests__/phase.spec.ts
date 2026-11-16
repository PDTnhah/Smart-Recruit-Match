import { actualCampaignPhase, CAMPAIGN_STATES, campaignMachine, nextStates, PHASE_END_DEADLINE } from '@srm/shared';
import { AUTO_EDGES, AUTO_PHASES, MANUAL_EDGES } from '../phase.js';

const key = (edge: { from: string; to: string }) => `${edge.from}->${edge.to}`;

describe('GĐ0: automatic and manual campaign edges', () => {
  it('GĐ0: automatic and manual edges together are exactly the campaign state table', () => {
    const table = CAMPAIGN_STATES.flatMap((from) => nextStates(campaignMachine, from).map((to) => key({ from, to })));
    const split = [...AUTO_EDGES, ...MANUAL_EDGES].map(key);
    expect(new Set(split).size).toBe(split.length);
    expect([...split].sort()).toEqual([...table].sort());
  });

  it('GĐ0: each automatic edge leaves the phase that its deadline ends', () => {
    for (const edge of AUTO_EDGES) {
      expect(PHASE_END_DEADLINE[edge.from]).toBe(edge.deadlineKey);
    }
    expect(AUTO_PHASES).toEqual(Object.keys(PHASE_END_DEADLINE));
  });

  it('FR-41: actualCampaignPhase follows the automatic edges, so the form and the API agree', () => {
    const deadlines = {
      intake_end: '2026-11-01T10:00:00.000Z',
      preference_end: '2026-11-08T10:00:00.000Z',
      testing_end: '2026-11-15T10:00:00.000Z',
    };
    const after = new Date('2026-12-01T00:00:00.000Z');
    for (const edge of AUTO_EDGES) {
      expect(actualCampaignPhase(edge.from, { [edge.deadlineKey]: deadlines[edge.deadlineKey] }, after)).toBe(edge.to);
    }
  });

  it('GĐ0: opening the campaign is manual', () => {
    expect(MANUAL_EDGES).toContainEqual({ from: 'DRAFT', to: 'INTAKE' });
    expect(AUTO_PHASES).not.toContain('DRAFT');
  });

  it('FR-41: cancelling is manual and the scheduler never looks at a cancelled campaign', () => {
    expect(MANUAL_EDGES).toContainEqual({ from: 'INTAKE', to: 'CANCELLED' });
    expect(AUTO_EDGES.map((edge) => edge.to)).not.toContain('CANCELLED');
    expect(AUTO_PHASES).not.toContain('CANCELLED');
  });
});
