// Server-side deadline of an exam session (AGENTS › Invariant 8, US-4.3 AC-1, AC-6, AC-8, AC-9,
// CONTEXT D51). Pure: the caller passes the time it read from `Clock`.

/**
 * A save or a submit that reaches the server this long after `deadline_at` is still taken, so an
 * answer sent in the last seconds is not lost on a slow network. `submitted_at` never passes
 * `deadline_at` all the same.
 */
export const EXAM_SAVE_GRACE_MS = 10_000;

const MINUTE_MS = 60_000;

/**
 * AC-1: a session ends `durationMinutes` after it starts, or at the end of the TESTING phase if
 * that comes first. The phase check refuses a start at or after `testing_end`, so the deadline is
 * always after `startedAt`.
 */
export function examDeadline(startedAt: Date, durationMinutes: number, testingEnd: Date | null): Date {
  const byDuration = startedAt.getTime() + durationMinutes * MINUTE_MS;
  const deadline = testingEnd ? Math.min(byDuration, testingEnd.getTime()) : byDuration;
  if (deadline <= startedAt.getTime()) {
    throw new Error(`examDeadline: deadline ${new Date(deadline).toISOString()} is not after the start`);
  }
  return new Date(deadline);
}

/** AC-6: whether a save reaching the server at `now` is still taken. */
export function acceptsSaves(now: Date, deadlineAt: Date): boolean {
  return now.getTime() <= deadlineAt.getTime() + EXAM_SAVE_GRACE_MS;
}

export type ExamClosing = { status: 'SUBMITTED' | 'EXPIRED'; submittedAt: Date };

/**
 * AC-8, AC-9: how a session closes at `now`. A student's submit within the grace is SUBMITTED at
 * the time it came, but never after `deadline_at`; a later one, or the sweep, closes it EXPIRED at
 * `deadline_at`.
 */
export function closingOf(now: Date, deadlineAt: Date, by: 'STUDENT' | 'SWEEP'): ExamClosing {
  if (by === 'STUDENT' && acceptsSaves(now, deadlineAt)) {
    return { status: 'SUBMITTED', submittedAt: new Date(Math.min(now.getTime(), deadlineAt.getTime())) };
  }
  return { status: 'EXPIRED', submittedAt: new Date(deadlineAt.getTime()) };
}
