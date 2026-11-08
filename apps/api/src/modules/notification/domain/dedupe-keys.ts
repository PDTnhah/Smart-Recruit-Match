import type { CampaignDeadlineKey } from '@srm/shared';

/**
 * `dedupe_key` values: the same key for the same recipient is one notice, so a repeated event, a
 * rerun of the reminder job or a second instance inserts nothing (unique `(user_id, dedupe_key)`,
 * CONTEXT D31).
 */
export const DEDUPE_KEYS = {
  campaignOpened: (campaignId: number) => `campaign_opened:${campaignId}`,
  /**
   * The deadline value is part of the key: an extended deadline (CONTEXT D27) is a new deadline
   * and is reminded once more.
   */
  deadline: (campaignId: number, deadlineKey: CampaignDeadlineKey, deadline: Date) =>
    `deadline:${campaignId}:${deadlineKey}:${deadline.toISOString()}`,
  /** Q6 gives a student preferences at most once per campaign (US-3.3, CONTEXT D47). */
  preferencesAutoAssigned: (campaignId: number) => `preferences_auto_assigned:${campaignId}`,
  /**
   * Center staff hear once per campaign which JDs have fewer preferences than places (US-3.4,
   * CONTEXT D48); an account created later gets it on the next sweep.
   */
  jdLowPreferences: (campaignId: number) => `jd_low_preferences:${campaignId}`,
  /** A preference is closed once for a test not taken (US-4.3, CONTEXT D51): one notice each. */
  examNotTaken: (preferenceId: number) => `exam_not_taken:${preferenceId}`,
  /**
   * One notice per CV version and outcome (US-2.4, CONTEXT D37): a redelivered result is quiet, a
   * profile after a failed dispatch is still announced, and a retry by command that fails again
   * with another job is announced again.
   */
  cvAnalysis: (outcome: 'ready' | 'failed' | 'attention', cvId: number, jobId: string | null) =>
    `cv_analysis_${outcome}:${cvId}:${jobId ?? 'not-dispatched'}`,
};
