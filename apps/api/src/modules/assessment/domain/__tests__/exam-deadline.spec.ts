import { acceptsSaves, closingOf, EXAM_SAVE_GRACE_MS, examDeadline } from '../exam-deadline.js';

// US-4.3 AC-1, AC-6, AC-8, AC-9 (AGENTS › Invariant 8, CONTEXT D51): the server decides the
// deadline, cut at the end of the TESTING phase, with a 10-second grace for late saves.

const at = (iso: string) => new Date(iso);
const START = at('2001-04-10T08:00:00.000Z');

describe('GĐ5: exam deadline (US-4.3)', () => {
  it('GĐ5 deadline is start + duration when the phase ends later', () => {
    expect(examDeadline(START, 45, at('2001-04-10T12:00:00.000Z'))).toEqual(at('2001-04-10T08:45:00.000Z'));
    expect(examDeadline(START, 45, null)).toEqual(at('2001-04-10T08:45:00.000Z'));
  });

  it('GĐ5 deadline is capped at testing_end for a late start', () => {
    expect(examDeadline(START, 45, at('2001-04-10T08:20:00.000Z'))).toEqual(at('2001-04-10T08:20:00.000Z'));
    expect(examDeadline(START, 45, at('2001-04-10T08:45:00.000Z'))).toEqual(at('2001-04-10T08:45:00.000Z'));
  });

  it('GĐ5 a deadline not after the start is a programming error', () => {
    expect(() => examDeadline(START, 45, START)).toThrow('not after the start');
    expect(() => examDeadline(START, 0, null)).toThrow('not after the start');
  });

  it('NFR-10 saves are taken until deadline + 10 s, not after', () => {
    const deadline = at('2001-04-10T08:45:00.000Z');
    expect(EXAM_SAVE_GRACE_MS).toBe(10_000);
    expect(acceptsSaves(at('2001-04-10T08:44:59.999Z'), deadline)).toBe(true);
    expect(acceptsSaves(at('2001-04-10T08:45:10.000Z'), deadline)).toBe(true);
    expect(acceptsSaves(at('2001-04-10T08:45:10.001Z'), deadline)).toBe(false);
  });

  it('GĐ5 a submit before the deadline is SUBMITTED at the time it came', () => {
    const deadline = at('2001-04-10T08:45:00.000Z');
    expect(closingOf(at('2001-04-10T08:30:00.000Z'), deadline, 'STUDENT')).toEqual({
      status: 'SUBMITTED',
      submittedAt: at('2001-04-10T08:30:00.000Z'),
    });
  });

  it('GĐ5 a submit within the grace is SUBMITTED at the deadline, never after', () => {
    const deadline = at('2001-04-10T08:45:00.000Z');
    expect(closingOf(at('2001-04-10T08:45:06.000Z'), deadline, 'STUDENT')).toEqual({
      status: 'SUBMITTED',
      submittedAt: deadline,
    });
  });

  it('GĐ5 a submit after the grace, and the sweep, close EXPIRED at the deadline', () => {
    const deadline = at('2001-04-10T08:45:00.000Z');
    const expired = { status: 'EXPIRED', submittedAt: deadline };
    expect(closingOf(at('2001-04-10T08:45:10.001Z'), deadline, 'STUDENT')).toEqual(expired);
    expect(closingOf(at('2001-04-10T09:30:00.000Z'), deadline, 'SWEEP')).toEqual(expired);
    // The returned time is a copy: changing it leaves the deadline alone.
    const closing = closingOf(at('2001-04-10T09:30:00.000Z'), deadline, 'SWEEP');
    closing.submittedAt.setTime(0);
    expect(deadline).toEqual(at('2001-04-10T08:45:00.000Z'));
  });
});
