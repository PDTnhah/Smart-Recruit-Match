import { SKILL_STATES, skillMachine } from '../skill.js';
import { mismatchedPairs } from './pairs.js';

// US-2.5 › Story refresh, FR-13: ADMIN approves, merges or rejects a new skill, once.
const LISTED_EDGES = [
  ['PENDING', 'APPROVED'],
  ['PENDING', 'REJECTED'],
  ['PENDING', 'MERGED'],
] as const;

describe('FR-13: skill review machine allows only listed transitions', () => {
  it('accepts exactly the listed edges among all state pairs', () => {
    expect(SKILL_STATES).toHaveLength(4);
    expect(mismatchedPairs(skillMachine, LISTED_EDGES)).toEqual([]);
  });

  it('FR-13 a new skill starts PENDING and every decision is final', () => {
    expect(skillMachine.initial).toBe('PENDING');
    for (const state of ['APPROVED', 'REJECTED', 'MERGED'] as const) {
      expect(skillMachine.transitions[state]).toEqual([]);
    }
  });
});
