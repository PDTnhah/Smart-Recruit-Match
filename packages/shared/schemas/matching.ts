import { z } from 'zod';
import { GPA_SCALE_MAX } from '../contracts/jd.js';

// Hard filter of GĐ3 (FR-14, US-3.1, CONTEXT D41): code checks the hard conditions of a JD before
// any LLM call, and a pair that fails is "Không đủ điều kiện" with one reason per failed condition.

/**
 * What the hard filter reads about a student. Nothing else is accepted: photo, gender, date of
 * birth, hometown, religion and marital status never reach a scoring step (BR-03).
 */
export const HardFilterFactsSchema = z.strictObject({
  major: z.string().trim().min(1).max(200).nullable(),
  /** Derived from the cohort by US-3.2; null when it cannot be. */
  yearOfStudy: z.int().min(1).max(6).nullable(),
  /** `students.gpa`, on the 4-point scale of `min_gpa`. */
  gpa4: z.number().min(0).max(GPA_SCALE_MAX).multipleOf(0.01).nullable(),
  /** Each language with its level and each certificate name of the confirmed profile, as written. */
  languageCertificates: z.array(z.string().trim().min(1).max(200)).max(50),
});

export type HardFilterFacts = z.output<typeof HardFilterFactsSchema>;

export const INELIGIBLE_REASON_CODES = [
  'MAJOR_NOT_ALLOWED',
  'MAJOR_MISSING',
  'YEAR_BELOW_MIN',
  'YEAR_MISSING',
  'GPA_BELOW_MIN',
  'GPA_MISSING',
  'LANGUAGE_NOT_MET',
] as const;

export type IneligibleReasonCode = (typeof INELIGIBLE_REASON_CODES)[number];

const reason = <C extends IneligibleReasonCode, R extends z.ZodType, A extends z.ZodType>(
  code: C,
  required: R,
  actual: A,
) => z.strictObject({ code: z.literal(code), required, actual });

const majors = z.array(z.string());

/** One failed condition: what the JD requires and what the student has (`null` when unknown). */
export const IneligibleReasonSchema = z.discriminatedUnion('code', [
  reason('MAJOR_NOT_ALLOWED', majors, z.string()),
  reason('MAJOR_MISSING', majors, z.null()),
  reason('YEAR_BELOW_MIN', z.int(), z.int()),
  reason('YEAR_MISSING', z.int(), z.null()),
  reason('GPA_BELOW_MIN', z.number(), z.number()),
  reason('GPA_MISSING', z.number(), z.null()),
  // One reason per required language; `actual` lists the student's languages and certificates.
  reason('LANGUAGE_NOT_MET', z.string(), z.array(z.string())),
]);

export type IneligibleReason = z.output<typeof IneligibleReasonSchema>;
