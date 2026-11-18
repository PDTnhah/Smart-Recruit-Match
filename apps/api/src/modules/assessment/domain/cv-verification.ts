import {
  type CvClaimRef,
  type CvTrustLevel,
  type CvVerdict,
  CV_VERDICT_POINTS,
  cvTrustLevelOf,
  type CvVerificationEvaluationItem,
  type CvVerificationQuestion,
  EVIDENCE_MATCH_MIN_SCORE,
  type StoredCvEvaluation,
} from '@srm/shared';
import { over, type Ratio, roundHalfUp } from '@srm/shared/scoring';

// Part D of the test (FR-25, US-4.8, AD-2, CONTEXT D57). Pure: the caller reads and writes the rows.

export interface CvTrust {
  /** 0–100: the mean of the verdict points, half-up. */
  trustX100: number;
  level: CvTrustLevel;
}

/**
 * AC-5: CONSISTENT 1, PARTIAL 0.5, INCONSISTENT and NO_ANSWER 0, averaged over the questions, × 100
 * and rounded half-up; the level by the constant thresholds. Never scored (AC-6).
 */
export function computeCvTrust(verdicts: readonly CvVerdict[]): CvTrust {
  if (verdicts.length === 0) throw new Error('cv trust: no verdict');
  const points = verdicts.reduce((sum, verdict) => sum + BigInt(CV_VERDICT_POINTS[verdict]), 0n);
  const mean: Ratio = over({ num: points, den: 1n }, BigInt(verdicts.length));
  const trustX100 = roundHalfUp(mean);
  return { trustX100, level: cvTrustLevelOf(trustX100) };
}

/**
 * AC-2: why the drafted questions cannot go into a test, or null. The AI Service checks them
 * against the CV; the backend checks again what it can without it (LESSONS §32): no more than
 * the job asked for, and never two questions about one entry.
 */
export function draftProblem(questions: readonly CvVerificationQuestion[], questionCount: number): string | null {
  if (questions.length > questionCount) return `${questions.length} questions for ${questionCount} asked`;
  const seen = new Set<string>();
  for (const { claim_ref: ref } of questions) {
    const key = claimKey(ref);
    if (seen.has(key)) return `two questions about ${key}`;
    seen.add(key);
  }
  return null;
}

/** Reason stored for a blank answer; the AI Service writes the same (evaluator.py › NO_ANSWER_REASON). */
export const NO_ANSWER_REASON = 'Sinh viên bỏ trống câu này.';

/**
 * AC-5: what is stored for an answer. A blank answer is NO_ANSWER whatever the result says, with no
 * LLM verdict, quote or reason of its own: the AI Service sets it without the LLM.
 */
export function storedEvaluationOf(answer: string | null, item: CvVerificationEvaluationItem): StoredCvEvaluation {
  if (answer === null) {
    return { verdict: 'NO_ANSWER', llmVerdict: null, quote: null, quoteScore: null, reason: NO_ANSWER_REASON };
  }
  return {
    verdict: item.verdict,
    llmVerdict: item.llm_verdict,
    quote: item.quote,
    quoteScore: item.quote_score,
    reason: item.reason,
  };
}

/**
 * AC-5, Invariant 5: the quote shown to staff, only when it was found in the answer. One that was
 * not stays on the row for audit, but is never shown as the student's words.
 */
export function foundQuoteOf(evaluation: StoredCvEvaluation | null): string | null {
  if (!evaluation?.quote || evaluation.quoteScore === null) return null;
  return evaluation.quoteScore >= EVIDENCE_MATCH_MIN_SCORE ? evaluation.quote : null;
}

const claimKey = (ref: CvClaimRef) => `${ref.section}[${ref.index}]`;
