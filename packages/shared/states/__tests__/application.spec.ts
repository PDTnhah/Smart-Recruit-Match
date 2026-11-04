import {
  APPLICATION_STATES,
  APPLICATION_STATUS_LABELS,
  APPLICATION_TERMINAL_STATES,
  applicationMachine,
} from '../application.js';
import { mismatchedPairs } from './pairs.js';

// US-3.3 AC-11: the edges of PRD › Vòng đời trạng thái › Hồ sơ ứng tuyển, copied from the diagram.
const PRD_EDGES = [
  ['PENDING_TEST', 'TEST_GRADED'],
  ['PENDING_TEST', 'CLOSED'],
  ['TEST_GRADED', 'BELOW_THRESHOLD'],
  ['TEST_GRADED', 'NOMINATED'],
  ['TEST_GRADED', 'WAITING_NEXT_ROUND'],
  ['WAITING_NEXT_ROUND', 'NOMINATED'],
  ['WAITING_NEXT_ROUND', 'CLOSED'],
  ['NOMINATED', 'INTERVIEW'],
  ['NOMINATED', 'HR_REJECTED'],
  ['INTERVIEW', 'PASSED'],
  ['INTERVIEW', 'RESERVE'],
  ['INTERVIEW', 'INTERVIEW_FAILED'],
  ['RESERVE', 'PASSED'],
  ['RESERVE', 'CLOSED'],
  ['PASSED', 'ACCEPTED'],
  ['PASSED', 'DECLINED'],
] as const;

describe('GĐ4 application lifecycle (US-3.3)', () => {
  it('application lifecycle allows exactly the 17 PRD transitions', () => {
    expect(APPLICATION_STATES).toHaveLength(13);
    // 16 edges between states, plus the creation in PENDING_TEST.
    expect(PRD_EDGES).toHaveLength(16);
    expect(applicationMachine.initial).toBe('PENDING_TEST');
    expect(mismatchedPairs(applicationMachine, PRD_EDGES)).toEqual([]);
  });

  it('terminal states are the six of the PRD and have no way out', () => {
    expect([...APPLICATION_TERMINAL_STATES].sort()).toEqual(
      ['ACCEPTED', 'BELOW_THRESHOLD', 'CLOSED', 'DECLINED', 'HR_REJECTED', 'INTERVIEW_FAILED'].sort(),
    );
    for (const state of APPLICATION_TERMINAL_STATES) expect(applicationMachine.transitions[state]).toEqual([]);
  });

  it('every state has a Vietnamese label', () => {
    expect(Object.keys(APPLICATION_STATUS_LABELS).sort()).toEqual([...APPLICATION_STATES].sort());
    for (const label of Object.values(APPLICATION_STATUS_LABELS)) expect(label.trim()).not.toBe('');
  });
});
