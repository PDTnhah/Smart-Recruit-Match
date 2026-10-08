import { z } from 'zod';

/** Error codes the Core Backend returns for state changes (AD-8). Later stories append to this list. */
export const API_ERROR_CODES = [
  'INVALID_TRANSITION',
  'TRANSITION_CONDITION_FAILED',
  'ROW_VERSION_CONFLICT',
  'ENTITY_NOT_FOUND',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Body of every domain error response: a stable machine code plus a human-readable message. */
export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
