/** Audit actions written by the company module; JD status changes use `TRANSITION` (AD-8). */
export const COMPANY_AUDIT_ACTIONS = {
  COMPANY_CREATED: 'COMPANY_CREATED',
  COMPANY_UPDATED: 'COMPANY_UPDATED',
  JD_CREATED: 'JD_CREATED',
  /** Any edit of a draft JD's fields. */
  JD_UPDATED: 'JD_UPDATED',
  /** The original PDF/DOCX was uploaded or replaced. */
  JD_FILE_ATTACHED: 'JD_FILE_ATTACHED',
  /** The JD Analyzer proposed requirements (system actor; model and prompt in `after`, US-2.3). */
  JD_REQUIREMENTS_PROPOSED: 'JD_REQUIREMENTS_PROPOSED',
  /** The analysis failed or could not be dispatched; HR enters the requirements by hand. */
  JD_ANALYSIS_FAILED: 'JD_ANALYSIS_FAILED',
  /** HR edited the requirements before confirming them (same version). */
  JD_REQUIREMENTS_UPDATED: 'JD_REQUIREMENTS_UPDATED',
  /** HR confirmed the requirements; the TRANSITION entry to PENDING_APPROVAL follows. */
  JD_REQUIREMENTS_CONFIRMED: 'JD_REQUIREMENTS_CONFIRMED',
  /** An approved JD's requirements were changed as version + 1 (BR-18). */
  JD_REQUIREMENTS_VERSIONED: 'JD_REQUIREMENTS_VERSIONED',
} as const;

/** Audit entity of `companies` rows; JDs use the machine name `job_description`. */
export const COMPANY_ENTITY = 'company';
