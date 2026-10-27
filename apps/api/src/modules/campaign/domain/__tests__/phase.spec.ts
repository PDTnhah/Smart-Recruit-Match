import { CAMPAIGN_STATES, campaignMachine, nextStates, PHASE_END_DEADLINE } from '@srm/shared';
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

  it('GĐ0: opening the campaign is manual', () => {
    expect(MANUAL_EDGES).toContainEqual({ from: 'DRAFT', to: 'INTAKE' });
    expect(AUTO_PHASES).not.toContain('DRAFT');
  });
});
