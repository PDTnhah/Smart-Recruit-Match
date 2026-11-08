import type { ExamSessionStatus } from '@srm/shared';

// Events the assessment module publishes after commit (ARCHITECTURE › Các module, CONTEXT D27).

/**
 * An exam session closed, by the student's submit or by the sweep (US-4.3 AC-8, AC-9). Grading
 * (US-4.4) listens; the event lives in the process only, so US-4.4 also sweeps closed sessions not
 * graded yet (LESSONS §34, CONTEXT D51).
 */
export const EXAM_SESSION_CLOSED = 'exam.session.closed';

export interface ExamSessionClosedEvent {
  sessionId: number;
  studentId: number;
  bankId: number;
  status: Exclude<ExamSessionStatus, 'IN_PROGRESS'>;
  submittedAt: string;
}
