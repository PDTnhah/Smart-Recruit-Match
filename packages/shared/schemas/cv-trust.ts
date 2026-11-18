import { z } from 'zod';
import { CV_CLAIM_SECTIONS, CV_VERDICTS, type CvVerdict } from '../contracts/cv-verification.js';

// The CV trust index of part D (FR-25, US-4.8 AC-5, AC-7, CONTEXT D57). For staff only, never
// scored: it does not enter S_test or S_final, and no state change reads it (AC-6). The thresholds
// are constants, not campaign parameters (D57).

/** `cv_verifications.status`: the drafting job. Only READY questions go into a session. */
export const CV_VERIFICATION_STATUSES = ['RUNNING', 'READY', 'FAILED'] as const;

export type CvVerificationStatus = (typeof CV_VERIFICATION_STATUSES)[number];

/** `cv_verifications.evaluation_status`: the checking job, once the session closed; null before. */
export const CV_EVALUATION_STATUSES = ['RUNNING', 'DONE', 'FAILED'] as const;

export type CvEvaluationStatus = (typeof CV_EVALUATION_STATUSES)[number];

/** Points of each verdict, in hundredths: CONSISTENT 1, PARTIAL 0.5, INCONSISTENT and NO_ANSWER 0. */
export const CV_VERDICT_POINTS: Readonly<Record<CvVerdict, number>> = {
  CONSISTENT: 100,
  PARTIAL: 50,
  INCONSISTENT: 0,
  NO_ANSWER: 0,
};

export const CV_TRUST_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;

export type CvTrustLevel = (typeof CV_TRUST_LEVELS)[number];

/** Lowest index of each level; anything lower is LOW. */
export const CV_TRUST_LEVEL_MIN = { HIGH: 75, MEDIUM: 40 } as const;

export const CV_TRUST_LEVEL_LABELS: Readonly<Record<CvTrustLevel, string>> = {
  HIGH: 'Cao',
  MEDIUM: 'Trung bình',
  LOW: 'Thấp',
};

/** The level of a trust index (0–100). */
export function cvTrustLevelOf(trust: number): CvTrustLevel {
  if (trust >= CV_TRUST_LEVEL_MIN.HIGH) return 'HIGH';
  if (trust >= CV_TRUST_LEVEL_MIN.MEDIUM) return 'MEDIUM';
  return 'LOW';
}

/** Stored per question in `cv_verification_questions.evaluation` (Invariant 12: with the run's model). */
export interface StoredCvEvaluation {
  verdict: CvVerdict;
  /** The LLM's verdict before the quote check; null for a blank answer. */
  llmVerdict: Exclude<CvVerdict, 'NO_ANSWER'> | null;
  quote: string | null;
  /** rapidfuzz score of the quote against the answer (0–100); null without a quote. */
  quoteScore: number | null;
  reason: string;
}

/**
 * Where part D of a session stands: NONE when the session has none (off for the JD, drafted too
 * late or the drafting failed), PENDING until the answers are checked, FAILED when the check
 * failed, DONE with the index.
 */
export const CV_TRUST_STATES = ['NONE', 'PENDING', 'FAILED', 'DONE'] as const;

export type CvTrustState = (typeof CV_TRUST_STATES)[number];

export const CvTrustQuestionSchema = z.object({
  no: z.int().positive(),
  stem: z.string(),
  claimSection: z.enum(CV_CLAIM_SECTIONS),
  /** The CV entry the question asks about, as the masked profile names it. */
  claimLabel: z.string(),
  /** Null when the student left it blank, or while the session is open. */
  answer: z.string().nullable(),
  verdict: z.enum(CV_VERDICTS).nullable(),
  quote: z.string().nullable(),
  reason: z.string().nullable(),
});

export type CvTrustQuestion = z.output<typeof CvTrustQuestionSchema>;

/** `GET /api/exam-sessions/{id}/cv-trust` (CENTER only, AC-7). */
export const CvTrustViewSchema = z.object({
  state: z.enum(CV_TRUST_STATES),
  /** 0–100: the mean of the verdict points, half-up; null until DONE. */
  trustScore: z.int().min(0).max(100).nullable(),
  trustLevel: z.enum(CV_TRUST_LEVELS).nullable(),
  questions: z.array(CvTrustQuestionSchema),
});

export type CvTrustView = z.output<typeof CvTrustViewSchema>;
