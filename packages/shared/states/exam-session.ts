import { defineMachine } from './machine.js';

/**
 * Lifecycle of an exam session, one student's single attempt at the test of one preference (PRD GĐ5,
 * BR-06, US-4.3 AC-4, AC-8, AC-9, CONTEXT D51). The student submits it, or the server closes it
 * EXPIRED once `deadline_at` and its grace have passed; either way it never opens again. Grading
 * (US-4.4) reads closed sessions and does not move this lifecycle.
 */
export const EXAM_SESSION_STATES = ['IN_PROGRESS', 'SUBMITTED', 'EXPIRED'] as const;

export type ExamSessionStatus = (typeof EXAM_SESSION_STATES)[number];

export const examSessionMachine = defineMachine<ExamSessionStatus>({
  // Also the audit entity of a session (apps/api assessment/domain/audit-actions.ts).
  name: 'exam_session',
  states: EXAM_SESSION_STATES,
  initial: 'IN_PROGRESS',
  transitions: { IN_PROGRESS: ['SUBMITTED', 'EXPIRED'], SUBMITTED: [], EXPIRED: [] },
});

/** Vietnamese names shown to the student. */
export const EXAM_SESSION_STATUS_LABELS: Readonly<Record<ExamSessionStatus, string>> = {
  IN_PROGRESS: 'Đang làm',
  SUBMITTED: 'Đã nộp',
  EXPIRED: 'Hết giờ',
};
