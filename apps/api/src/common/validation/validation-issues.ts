import type { z, ZodError } from 'zod';
import { ValidationFailedError, type ValidationIssue } from '../errors/index.js';

/** Zod issues as `{ path, message }` pairs, with `prefix` in front of each path. Values are never echoed. */
export function validationIssues(error: ZodError, prefix?: string): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: [...(prefix ? [prefix] : []), ...issue.path.map(String)].join('.'),
    message: issue.message,
  }));
}

/**
 * Parses a value a service assembled itself (e.g. a stored config merged with a patch). Failures
 * become 400 VALIDATION_FAILED with paths under `prefix`, like request validation errors.
 */
export function parseOrFail<S extends z.ZodType>(schema: S, value: unknown, prefix: string): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationFailedError(validationIssues(result.error, prefix));
  return result.data;
}
