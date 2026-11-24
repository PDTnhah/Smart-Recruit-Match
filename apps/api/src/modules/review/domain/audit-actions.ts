import type { CampaignStatus, HrDecision, NominationStatus } from '@srm/shared';

/** Audit actions of the review module (US-5.3, AD-8): one entry per HR decision, request, extension. */
export const REVIEW_AUDIT_ACTIONS = {
  HR_DECISION: 'HR_REVIEW_DECIDED',
  SUPPLEMENT_REQUESTED: 'SUPPLEMENT_REQUESTED',
  DEADLINE_EXTENDED: 'REVIEW_DEADLINE_EXTENDED',
} as const;

/** Audit entity of a nomination: the name of `nominationMachine`. */
export const NOMINATION_ENTITY = 'nomination';

/** Audit entity of an extension: the JD whose deadline moved. */
export const JD_ENTITY = 'job_description';

/** Where an HR decision moves the nomination and its preference (GĐ8 step 2). */
export const DECISION_TARGET: Readonly<Record<HrDecision, NominationStatus & ('INTERVIEW' | 'HR_REJECTED')>> = {
  INVITE: 'INTERVIEW',
  REJECT: 'HR_REJECTED',
};

/** `reason` of the transitions a decision makes (AD-8 requires one). */
export const DECISION_REASON: Readonly<Record<HrDecision, string>> = {
  INVITE: 'HR_INVITED_TO_INTERVIEW',
  REJECT: 'HR_REJECTED',
};

/** HR decides, asks for more candidates and the center extends while rounds are reviewed (GĐ8, GĐ10). */
export const REVIEW_PHASES: readonly CampaignStatus[] = ['ALLOCATION_REVIEW', 'SUPPLEMENTARY'];
