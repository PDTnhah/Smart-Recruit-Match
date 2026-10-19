/** Attempts an email gets before it is marked FAILED (CONTEXT D31, like AI jobs in NFR-10). */
export const EMAIL_MAX_ATTEMPTS = 3;

/** Wait after the 1st failed attempt, and after the 2nd; SMTP outages are usually short. */
const FIRST_RETRY_MS = 60_000;
const LATER_RETRY_MS = 5 * 60_000;

export type EmailFailureOutcome = { status: 'PENDING'; nextAttemptAt: Date } | { status: 'FAILED' };

/**
 * What happens to an email after a failed attempt. `attempts` counts every attempt made so far,
 * the failed one included.
 */
export function afterEmailFailure(attempts: number, now: Date): EmailFailureOutcome {
  if (attempts >= EMAIL_MAX_ATTEMPTS) return { status: 'FAILED' };
  const delay = attempts <= 1 ? FIRST_RETRY_MS : LATER_RETRY_MS;
  return { status: 'PENDING', nextAttemptAt: new Date(now.getTime() + delay) };
}
