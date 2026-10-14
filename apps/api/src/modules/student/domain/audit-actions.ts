/** Audit actions written by the student module (US-1.6); CV status changes use `TRANSITION` (AD-8). */
export const STUDENT_AUDIT_ACTIONS = {
  /** A student accepted a terms version for a campaign. */
  CONSENT_ACCEPTED: 'CONSENT_ACCEPTED',
  /** A new CV version was uploaded; it is the active one. */
  CV_SUBMITTED: 'CV_SUBMITTED',
  /** The previous version lost `active` to a newer upload. Not a status change. */
  CV_SUPERSEDED: 'CV_SUPERSEDED',
} as const;

/** Audit entity of `consents` rows; CVs use the machine name `cv`. */
export const CONSENT_ENTITY = 'consent';
