/** Audit actions written by the company module; JD status changes use `TRANSITION` (AD-8). */
export const COMPANY_AUDIT_ACTIONS = {
  COMPANY_CREATED: 'COMPANY_CREATED',
  COMPANY_UPDATED: 'COMPANY_UPDATED',
  JD_CREATED: 'JD_CREATED',
  /** Any edit of a draft JD's fields. */
  JD_UPDATED: 'JD_UPDATED',
  /** The original PDF/DOCX was uploaded or replaced. */
  JD_FILE_ATTACHED: 'JD_FILE_ATTACHED',
} as const;

/** Audit entity of `companies` rows; JDs use the machine name `job_description`. */
export const COMPANY_ENTITY = 'company';
