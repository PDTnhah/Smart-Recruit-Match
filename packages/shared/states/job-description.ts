import { defineMachine } from './machine.js';

/**
 * JD lifecycle, PRD › Vòng đời trạng thái › JD: Nháp → Chờ HR xác nhận yêu cầu → Chờ Trung tâm duyệt
 * → Đã duyệt → Đang tuyển → Đủ chỉ tiêu | Đóng.
 */
export const JOB_DESCRIPTION_STATES = [
  'DRAFT',
  'PENDING_HR_CONFIRMATION',
  'PENDING_APPROVAL',
  'APPROVED',
  'RECRUITING',
  'FILLED',
  'CLOSED',
] as const;

export type JobDescriptionStatus = (typeof JOB_DESCRIPTION_STATES)[number];

export const jobDescriptionMachine = defineMachine<JobDescriptionStatus>({
  name: 'job_description',
  states: JOB_DESCRIPTION_STATES,
  initial: 'DRAFT',
  transitions: {
    DRAFT: ['PENDING_HR_CONFIRMATION'],
    PENDING_HR_CONFIRMATION: ['PENDING_APPROVAL'],
    PENDING_APPROVAL: ['APPROVED'],
    APPROVED: ['RECRUITING'],
    RECRUITING: ['FILLED', 'CLOSED'],
    FILLED: [],
    CLOSED: [],
  },
});
