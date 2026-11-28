import type { CampaignStatus } from '@srm/shared';

/** Audit actions of the interview module that are not a state change (US-5.4, AD-8). */
export const INTERVIEW_AUDIT_ACTIONS = {
  SCHEDULED: 'INTERVIEW_SCHEDULED',
  /** HR moved an interview the student had not answered yet: no state changes, the time does. */
  TIME_CHANGED: 'INTERVIEW_TIME_CHANGED',
  OFFER_SENT: 'OFFER_SENT',
} as const;

/** Audit entities: the names of `interviewMachine`, `offerMachine` and `nominationMachine`. */
export const INTERVIEW_ENTITY = 'interview';
export const OFFER_ENTITY = 'offer';
export const NOMINATION_ENTITY = 'nomination';

/** `reason` of the transitions GĐ9 makes (AD-8 requires one). */
export const INTERVIEW_REASONS = {
  CONFIRMED: 'STUDENT_CONFIRMED_INTERVIEW',
  RESCHEDULE_REQUESTED: 'STUDENT_REQUESTED_RESCHEDULE',
  RESCHEDULED: 'HR_RESCHEDULED_INTERVIEW',
  RESULT: 'HR_RECORDED_INTERVIEW_RESULT',
  /** BR-14: HR's PASSED, but the JD had no place left. */
  RESERVED_FOR_QUOTA: 'HR_PASSED_NO_PLACE_LEFT',
  OFFER_ACCEPTED: 'STUDENT_ACCEPTED_OFFER',
  OFFER_DECLINED: 'STUDENT_DECLINED_OFFER',
  OFFER_EXPIRED: 'OFFER_EXPIRED',
  /** BR-15: the student accepted another offer of the campaign. */
  ACCEPTED_ELSEWHERE: 'STUDENT_ACCEPTED_OTHER_OFFER',
  /** AC-7: a place was freed and this reserve ranks first. */
  PROMOTED: 'RESERVE_PROMOTED_TO_FREE_PLACE',
  RESERVE_EXPIRED: 'RESERVE_TIME_EXPIRED',
  JD_FILLED: 'JD_QUOTA_ACCEPTED',
} as const;

/** GĐ9 runs while rounds are reviewed, also next to a supplementary round (GĐ10 step 1). */
export const INTERVIEW_PHASES: readonly CampaignStatus[] = ['ALLOCATION_REVIEW', 'SUPPLEMENTARY'];
