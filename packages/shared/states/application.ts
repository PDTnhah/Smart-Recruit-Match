import { defineMachine } from './machine.js';

/**
 * Lifecycle of an application, one student × JD pair from the moment the student picks the JD as a
 * preference (PRD › Vòng đời trạng thái › Hồ sơ ứng tuyển, AD-8, US-3.3, CONTEXT D47). US-3.3 only
 * creates rows in PENDING_TEST; the exam (EPIC-4) and allocation, HR review and offers (EPIC-5)
 * move them on with `transitionTo`.
 */
export const APPLICATION_STATES = [
  'PENDING_TEST',
  'TEST_GRADED',
  'BELOW_THRESHOLD',
  'WAITING_NEXT_ROUND',
  'NOMINATED',
  'INTERVIEW',
  'HR_REJECTED',
  'PASSED',
  'RESERVE',
  'INTERVIEW_FAILED',
  'ACCEPTED',
  'DECLINED',
  'CLOSED',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATES)[number];

export const applicationMachine = defineMachine<ApplicationStatus>({
  name: 'application',
  states: APPLICATION_STATES,
  initial: 'PENDING_TEST',
  transitions: {
    // CLOSED: the test was not taken before the deadline (BR-06).
    PENDING_TEST: ['TEST_GRADED', 'CLOSED'],
    TEST_GRADED: ['BELOW_THRESHOLD', 'NOMINATED', 'WAITING_NEXT_ROUND'],
    BELOW_THRESHOLD: [],
    WAITING_NEXT_ROUND: ['NOMINATED', 'CLOSED'],
    NOMINATED: ['INTERVIEW', 'HR_REJECTED'],
    INTERVIEW: ['PASSED', 'RESERVE', 'INTERVIEW_FAILED'],
    HR_REJECTED: [],
    PASSED: ['ACCEPTED', 'DECLINED'],
    RESERVE: ['PASSED', 'CLOSED'],
    INTERVIEW_FAILED: [],
    ACCEPTED: [],
    DECLINED: [],
    CLOSED: [],
  },
});

/** States with no way out: the application is over. */
export const APPLICATION_TERMINAL_STATES = APPLICATION_STATES.filter(
  (state) => applicationMachine.transitions[state].length === 0,
);

/** Vietnamese names of the PRD diagram, shown to students, HR and the center alike. */
export const APPLICATION_STATUS_LABELS: Readonly<Record<ApplicationStatus, string>> = {
  PENDING_TEST: 'Chờ làm test',
  TEST_GRADED: 'Đã chấm test',
  BELOW_THRESHOLD: 'Không đạt ngưỡng',
  WAITING_NEXT_ROUND: 'Chờ vòng sau',
  NOMINATED: 'Được đề cử',
  INTERVIEW: 'Mời phỏng vấn',
  HR_REJECTED: 'HR từ chối',
  PASSED: 'Đạt phỏng vấn',
  RESERVE: 'Dự bị',
  INTERVIEW_FAILED: 'Không đạt phỏng vấn',
  ACCEPTED: 'Đã nhận thực tập',
  DECLINED: 'Sinh viên từ chối / quá hạn',
  CLOSED: 'Đóng',
};
