import { z } from 'zod';

/** Error codes the Core Backend returns (AD-8, CONTEXT D25). Later stories append to this list. */
export const API_ERROR_CODES = [
  'INVALID_TRANSITION',
  'TRANSITION_CONDITION_FAILED',
  'ROW_VERSION_CONFLICT',
  'ENTITY_NOT_FOUND',
  // Authentication, authorization and validation (US-1.3, CONTEXT D25).
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'FORBIDDEN',
  'VALIDATION_FAILED',
  'EMAIL_TAKEN',
  'STUDENT_CODE_TAKEN',
  'ROLE_NOT_ALLOWED',
  // Campaign setup and phase checks (US-1.4, CONTEXT D27).
  'CAMPAIGN_CONFIG_LOCKED',
  'CAMPAIGN_PHASE_MISMATCH',
  // Companies, HR invitations, JDs and file uploads (US-1.5, CONTEXT D28).
  'INVITATION_INVALID',
  'JD_NOT_EDITABLE',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FILE_TYPE',
  // Data-processing consent and CV submission (US-1.6, CONTEXT D30).
  'CONSENT_REQUIRED',
  'TERMS_OUTDATED',
  'CV_SUBMISSION_CONFLICT',
  // JD requirements confirmation and versioning (US-2.3, CONTEXT D35).
  'JD_REQUIREMENTS_NOT_EDITABLE',
  // Skill catalogue review (US-2.5, CONTEXT D39).
  'SKILL_NAME_TAKEN',
  // Skill taxonomy (US-2.7, CONTEXT D43).
  'SKILL_IMPLICATION_CYCLE',
  'SKILL_NOT_APPROVED',
  // Profile review by the student (US-2.6, CONTEXT D40).
  'CV_PROFILE_NOT_EDITABLE',
  // Matching runs (US-3.2, CONTEXT D46).
  'MATCHING_RUN_IN_PROGRESS',
  'MATCHING_RUN_TOO_LARGE',
  'AI_UNAVAILABLE',
  // Preference lists (US-3.3, CONTEXT D47): one code per rule a list breaks.
  'PREFERENCES_TOO_MANY',
  'PREFERENCE_NOT_IN_SHORTLIST',
  'PREFERENCE_DUPLICATE_JD',
  'PREFERENCE_RANK_NOT_CONTIGUOUS',
  'PREFERENCES_INCOMPLETE',
  // Exam blueprint and question bank (US-4.1, US-4.2, CONTEXT D49, D50).
  'JD_NOT_APPROVED',
  'QUESTION_BANK_LOCKED',
  'QUESTION_GENERATION_RUNNING',
  'QUESTION_BANK_JD_OUTDATED',
  'QUESTION_BANK_INCOMPLETE',
  'BANK_NOT_LOCKED',
  // Exam room (US-4.3, CONTEXT D51).
  'EXAM_ALREADY_TAKEN',
  'EXAM_CLOSED',
  'EXAM_ANSWER_INVALID',
  'EXAM_BANK_INCOMPLETE',
  'PREFERENCE_NOT_PENDING_TEST',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Body of every domain error response: a stable machine code plus a human-readable message. */
export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
