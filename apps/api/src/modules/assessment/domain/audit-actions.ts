/** Audit actions written by the assessment module (US-4.1, CONTEXT D49). */
export const ASSESSMENT_AUDIT_ACTIONS = {
  /** A JD got its question bank with the default blueprint; after is `{ jdId, jdVersion, blueprint }`. */
  QUESTION_BANK_CREATED: 'QUESTION_BANK_CREATED',
  /** CENTER changed the blueprint; before and after are `{ blueprint }`. */
  EXAM_BLUEPRINT_UPDATED: 'EXAM_BLUEPRINT_UPDATED',
  /** A generation job was started for the bank; after is `{ runId, jobId }`. */
  QUESTION_GENERATION_STARTED: 'QUESTION_GENERATION_STARTED',
} as const;

/** Audit entity of a question bank; its `entity_id` is the bank id. */
export const QUESTION_BANK_ENTITY = 'question_bank';
