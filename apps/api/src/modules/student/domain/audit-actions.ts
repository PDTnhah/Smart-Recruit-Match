/** Audit actions written by the student module (US-1.6); CV status changes use `TRANSITION` (AD-8). */
export const STUDENT_AUDIT_ACTIONS = {
  /** A student accepted a terms version for a campaign. */
  CONSENT_ACCEPTED: 'CONSENT_ACCEPTED',
  /** A new CV version was uploaded; it is the active one. */
  CV_SUBMITTED: 'CV_SUBMITTED',
  /** The previous version lost `active` to a newer upload. Not a status change. */
  CV_SUPERSEDED: 'CV_SUPERSEDED',
  /** The CV Parser's profile is stored (US-2.4). The entry names the model, never the data. */
  CV_ANALYSED: 'CV_ANALYSED',
  /** The analysis failed or was never sent; the student uploads again (US-2.4 AC-11). */
  CV_ANALYSIS_FAILED: 'CV_ANALYSIS_FAILED',
  /**
   * The student saved the profile, as a draft or to confirm it (US-2.6); confirming adds the
   * TRANSITION entry. Section sizes only, never the text (NFR-2).
   */
  CV_PROFILE_SAVED: 'CV_PROFILE_SAVED',
  /** "Sửa lại": a new version copies a confirmed one, to be confirmed again (US-2.6 AC-12). */
  CV_PROFILE_REOPENED: 'CV_PROFILE_REOPENED',
} as const;

/** Audit entity of `consents` rows; CVs use the machine name `cv`. */
export const CONSENT_ENTITY = 'consent';
