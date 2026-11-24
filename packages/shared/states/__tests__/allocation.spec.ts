import { ALLOCATION_ROUND_STATES, allocationRoundMachine } from '../allocation-round.js';
import { applicationMachine } from '../application.js';
import { canTransition } from '../machine.js';
import { NOMINATION_ACTIVE_STATES, NOMINATION_STATES, nominationMachine } from '../nomination.js';
import { mismatchedPairs } from './pairs.js';

describe('GĐ7 allocation lifecycles (US-5.2)', () => {
  it('a round goes DRAFT → PUBLISHED once, never back', () => {
    expect(ALLOCATION_ROUND_STATES).toEqual(['DRAFT', 'PUBLISHED']);
    expect(allocationRoundMachine.initial).toBe('DRAFT');
    expect(mismatchedPairs(allocationRoundMachine, [['DRAFT', 'PUBLISHED']])).toEqual([]);
  });

  it('a nomination has the edges of the application lifecycle from NOMINATED on', () => {
    expect(nominationMachine.initial).toBe('NOMINATED');
    for (const from of NOMINATION_STATES) {
      for (const to of NOMINATION_STATES) {
        expect([from, to, canTransition(nominationMachine, from, to)]).toEqual([
          from,
          to,
          canTransition(applicationMachine, from, to),
        ]);
      }
    }
  });

  it('BR-08 active states are the four of ARCHITECTURE › Các bảng chính', () => {
    expect([...NOMINATION_ACTIVE_STATES].sort()).toEqual(['INTERVIEW', 'NOMINATED', 'PASSED', 'RESERVE']);
  });
});
