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
