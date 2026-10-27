// Pure rules on a JD, used as transitionTo guards (US-1.5 AC-6, AC-7, CONTEXT D28).

export type CheckResult = { ok: true } | { ok: false; reasonCode: string };

/** Reason codes returned in `details.reasonCode` of a 422 TRANSITION_CONDITION_FAILED. */
export const JD_REASON_CODES = {
  /** Neither a description nor a file: nothing to analyse. */
  NO_CONTENT: 'JD_NO_CONTENT',
  /** BR-02: the normalized requirements have not been confirmed by HR. */
  REQUIREMENTS_NOT_CONFIRMED: 'REQUIREMENTS_NOT_CONFIRMED',
} as const;

/** AC-6: a JD can be submitted once it has a description or an original file. */
export function checkSubmittable(jd: { rawText: string | null; fileKey: string | null }): CheckResult {
  const hasText = jd.rawText !== null && jd.rawText.trim() !== '';
  if (hasText || jd.fileKey !== null) return { ok: true };
  return { ok: false, reasonCode: JD_REASON_CODES.NO_CONTENT };
}

/**
 * BR-02: the center approves only a JD whose requirements HR has confirmed. PENDING_APPROVAL is
 * reached only through that confirmation (US-2.3); this guard is the second line.
 */
export function checkApprovable(jd: { requirementsReady: boolean }): CheckResult {
  if (jd.requirementsReady) return { ok: true };
  return { ok: false, reasonCode: JD_REASON_CODES.REQUIREMENTS_NOT_CONFIRMED };
}
