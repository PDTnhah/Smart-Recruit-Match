import { z } from 'zod';

// Zod builders shared by the request schemas, defined once so every endpoint validates alike.

/** row_version the caller last read (optimistic lock, AD-8). */
export const RowVersionSchema = z.number().int().min(0);

/**
 * row_version sent as a multipart text field: digits only, so an empty field fails instead of
 * coercing to 0 and matching a fresh record.
 */
export const RowVersionFieldSchema = z
  .string()
  .trim()
  .regex(/^\d{1,9}$/, { error: 'rowVersion phải là số nguyên không âm' })
  .transform(Number);

/** A record id sent as a multipart text field: digits only, no leading zero, then a number. */
export const IdFieldSchema = (error: string) =>
  z.string({ error }).trim().regex(/^[1-9]\d{0,9}$/, { error }).transform(Number);

/** Optional free text: trimmed, at most `max` characters; `null` clears it in a patch. */
export const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} tối đa ${max} ký tự` })
    .nullable()
    .optional();

/**
 * Runs a cross-field check as long as the fields it reads are valid, even when other fields are
 * not, so the form shows every error at once (Zod skips object refinements after any issue,
 * LESSONS §10). Pass the result as the second argument of `superRefine`.
 */
export const whenValid = (fields: readonly string[]) => ({
  when: (payload: z.core.ParsePayload) => payload.issues.every((issue) => !fields.includes(String(issue.path?.[0]))),
});
