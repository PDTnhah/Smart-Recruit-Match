import { EXAM_SESSION_STATES, EXAM_SESSION_STATUS_LABELS, examSessionMachine } from '../exam-session.js';
import { mismatchedPairs } from './pairs.js';

// PRD GĐ5, BR-06, US-4.3 AC-4, AC-8, AC-9: a session is taken once; the student submits it or the
// server closes it at the deadline, and a closed session never opens again.
const EXAM_SESSION_EDGES = [
  ['IN_PROGRESS', 'SUBMITTED'],
  ['IN_PROGRESS', 'EXPIRED'],
] as const;

describe('BR-06: exam session machine closes once', () => {
  it('BR-06 accepts exactly the listed edges among all state pairs', () => {
    expect(EXAM_SESSION_STATES).toHaveLength(3);
    expect(mismatchedPairs(examSessionMachine, EXAM_SESSION_EDGES)).toEqual([]);
  });

  it('BR-06 a session starts IN_PROGRESS; SUBMITTED and EXPIRED are final', () => {
    expect(examSessionMachine.initial).toBe('IN_PROGRESS');
    expect(examSessionMachine.transitions.SUBMITTED).toEqual([]);
    expect(examSessionMachine.transitions.EXPIRED).toEqual([]);
  });

  it('GĐ5 the machine name is the audit entity; every state has a label', () => {
    expect(examSessionMachine.name).toBe('exam_session');
    expect(Object.keys(EXAM_SESSION_STATUS_LABELS).sort()).toEqual([...EXAM_SESSION_STATES].sort());
  });
});
