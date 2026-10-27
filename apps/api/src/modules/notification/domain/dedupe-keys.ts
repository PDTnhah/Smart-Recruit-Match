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
  /**
   * One notice per CV version and outcome (US-2.4, CONTEXT D37): a redelivered result is quiet, a
   * profile after a failed dispatch is still announced, and a retry by command that fails again
   * with another job is announced again.
   */
  cvAnalysis: (outcome: 'ready' | 'failed' | 'attention', cvId: number, jobId: string | null) =>
    `cv_analysis_${outcome}:${cvId}:${jobId ?? 'not-dispatched'}`,
};
