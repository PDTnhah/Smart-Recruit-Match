/** Audit actions written by the assessment module (US-4.1, US-4.2, CONTEXT D49, D50). */
export const ASSESSMENT_AUDIT_ACTIONS = {
  /** A JD got its question bank with the default blueprint; after is `{ jdId, jdVersion, blueprint }`. */
  QUESTION_BANK_CREATED: 'QUESTION_BANK_CREATED',
  /** CENTER changed the blueprint; before and after are `{ blueprint }`. */
  EXAM_BLUEPRINT_UPDATED: 'EXAM_BLUEPRINT_UPDATED',
  /** A generation job was started for the bank; after is `{ runId, jobId }`. */
  QUESTION_GENERATION_STARTED: 'QUESTION_GENERATION_STARTED',
  /**
   * A question of the locked bank was retired (US-4.2 AC-7); before is `{ version }`, after is
   * `{ version, questionId }`. Locking itself is the bank's TRANSITION entry.
   */
  QUESTION_BANK_VERSIONED: 'QUESTION_BANK_VERSIONED',
  /**
   * A student started the test of a preference (US-4.3 AC-1); after is `{ preferenceId, bankId,
   * bankVersion, seed, deadlineAt }`. Closing the session is its TRANSITION entry.
   */
  EXAM_SESSION_STARTED: 'EXAM_SESSION_STARTED',
  /**
   * Closed sessions of a campaign were sent to the Grader (US-4.4 AC-2); entity the run, after is
   * `{ campaignId, jobId, sessionCount }`.
   */
  ESSAY_GRADING_DISPATCHED: 'ESSAY_GRADING_DISPATCHED',
  /**
   * The results of a session were computed and published (US-4.4 AC-11); after is `{ scoreA,
   * scoreB, sTest, preferenceId, sFinal }`. The preference's move is its own TRANSITION entry.
   */
  EXAM_RESULTS_PUBLISHED: 'EXAM_RESULTS_PUBLISHED',
} as const;

/** Audit entity of a question bank, its `entity_id` the bank id; also `questionBankMachine.name`. */
export const QUESTION_BANK_ENTITY = 'question_bank';

/** Audit entity of an exam session, its `entity_id` the session id; also `examSessionMachine.name`. */
export const EXAM_SESSION_ENTITY = 'exam_session';

/** Audit entity of an essay grading run (US-4.4), its `entity_id` the run id. */
export const ESSAY_GRADING_RUN_ENTITY = 'essay_grading_run';
