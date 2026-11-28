import type { CampaignDeadlineKey } from '@srm/shared';

/**
 * `dedupe_key` values: the same key for the same recipient is one notice, so a repeated event, a
 * rerun of the reminder job or a second instance inserts nothing (unique `(user_id, dedupe_key)`,
 * CONTEXT D31).
 */
export const DEDUPE_KEYS = {
  campaignOpened: (campaignId: number) => `campaign_opened:${campaignId}`,
  /** One notice per edit that moved deadlines (US-1.10 AC-5): the row_version after the edit. */
  campaignDeadlinesChanged: (campaignId: number, rowVersion: number) =>
    `campaign_deadlines_changed:${campaignId}:${rowVersion}`,
  /** A campaign is cancelled once (US-1.10 AC-8): CANCELLED is final. */
  campaignCancelled: (campaignId: number) => `campaign_cancelled:${campaignId}`,
  /**
   * The deadline value is part of the key: a moved deadline, later or earlier (CONTEXT D27, D56),
   * is a new deadline and is reminded once more.
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
  /** The results of a session are published once (US-4.4 AC-11): one notice each. */
  examResultPublished: (sessionId: number) => `exam_result_published:${sessionId}`,
  /** A round is published once (US-5.2): one notice per student, and per JD for its HR. */
  nominationsPublished: (roundId: number, jdId?: number) =>
    jdId === undefined ? `nominations_published:${roundId}` : `nominations_published:${roundId}:jd:${jdId}`,
  /**
   * HR's deadline for a JD of a round, reminded once and reported overdue once (US-5.3 AC-10); the
   * deadline is part of the key, so an extension by the center is reminded again.
   */
  hrReviewDueSoon: (roundId: number, jdId: number, dueAt: Date) =>
    `hr_review_due_soon:${roundId}:${jdId}:${dueAt.toISOString()}`,
  hrReviewOverdue: (roundId: number, jdId: number, dueAt: Date) =>
    `hr_review_overdue:${roundId}:${jdId}:${dueAt.toISOString()}`,
  /** One notice per supplement request (US-5.3 AC-9). */
  supplementRequested: (requestId: number) => `supplement_requested:${requestId}`,
  /** GĐ9 (US-5.4): an interview is scheduled once; each new time has its row version. */
  interviewScheduled: (interviewId: number) => `interview_scheduled:${interviewId}`,
  interviewRescheduled: (interviewId: number, rowVersion: number) => `interview_rescheduled:${interviewId}:${rowVersion}`,
  /** The student asks for another time once per interview (AC-2). */
  interviewRescheduleRequested: (interviewId: number) => `interview_reschedule_requested:${interviewId}`,
  /** A nomination reaches each GĐ9 state once: a RESERVE later PASSED hears both. */
  interviewResult: (nominationId: number, status: string) => `interview_result:${nominationId}:${status}`,
  reserveClosed: (nominationId: number) => `reserve_closed:${nominationId}`,
  /** An offer is answered once (AC-6, AC-7). */
  offerAnswered: (offerId: number) => `offer_answered:${offerId}`,
  /**
   * One notice per CV version and outcome (US-2.4, CONTEXT D37): a redelivered result is quiet, a
   * profile after a failed dispatch is still announced, and a retry by command that fails again
   * with another job is announced again.
   */
  cvAnalysis: (outcome: 'ready' | 'failed' | 'attention', cvId: number, jobId: string | null) =>
    `cv_analysis_${outcome}:${cvId}:${jobId ?? 'not-dispatched'}`,
};
