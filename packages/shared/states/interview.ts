import { defineMachine } from './machine.js';

/**
 * Lifecycle of an interview of one nomination in INTERVIEW (PRD GĐ9 step 1–2, FR-30, US-5.4): HR
 * schedules it, the student confirms or asks once for another time (`reschedule_requested_at`
 * keeps the one request), HR sets a new time, and HR records the result (BR-13). A new time from
 * HR while the student has not answered yet changes no state; it is a versioned update.
 */
export const INTERVIEW_STATES = ['SCHEDULED', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'DONE'] as const;

export type InterviewStatus = (typeof INTERVIEW_STATES)[number];

export const interviewMachine = defineMachine<InterviewStatus>({
  // Also the audit entity of an interview.
  name: 'interview',
  states: INTERVIEW_STATES,
  initial: 'SCHEDULED',
  transitions: {
    SCHEDULED: ['CONFIRMED', 'RESCHEDULE_REQUESTED', 'DONE'],
    // HR moves a confirmed interview: the student confirms the new time again.
    CONFIRMED: ['SCHEDULED', 'RESCHEDULE_REQUESTED', 'DONE'],
    RESCHEDULE_REQUESTED: ['SCHEDULED', 'DONE'],
    DONE: [],
  },
});

/** Interviews HR may still move or record a result for. */
export const INTERVIEW_OPEN_STATES = ['SCHEDULED', 'CONFIRMED', 'RESCHEDULE_REQUESTED'] as const satisfies readonly InterviewStatus[];

export const INTERVIEW_STATUS_LABELS: Readonly<Record<InterviewStatus, string>> = {
  SCHEDULED: 'Chờ sinh viên xác nhận',
  CONFIRMED: 'Sinh viên đã xác nhận',
  RESCHEDULE_REQUESTED: 'Sinh viên xin đổi lịch',
  DONE: 'Đã có kết quả',
};
