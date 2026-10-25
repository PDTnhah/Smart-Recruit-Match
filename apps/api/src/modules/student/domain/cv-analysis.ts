import type { CvStatus } from '@srm/shared';

// What to do with a CV_PARSE result (US-2.4 AC-9 to AC-11, CONTEXT D33, D37). Pure: the listener
// locks the CV row first, so two copies of one result are decided one after the other.

export type CvAnalysisDecision = 'APPLY_SUCCESS' | 'APPLY_FAILURE' | 'IGNORE';

export interface AnalysedCv {
  status: CvStatus;
  version: number;
  /** The version that counts; an older one lost it to a newer upload (BR-01). */
  active: boolean;
}

/**
 * A result applies only to the CV version it parsed, while that version still counts and waits
 * for it (PENDING_ANALYSIS). A duplicate, a result for a replaced version, or a late answer after
 * the CV moved on is ignored without a write or an audit entry (AC-10).
 *
 * One exception, as for JDs (CONTEXT D35): a profile still applies after ANALYSIS_FAILED. Each
 * version is dispatched once, so a success after a failure means the dispatch was reported failed
 * (a publisher-confirm timeout) although the broker had taken the job; the student then gets the
 * profile instead of a request to upload again.
 */
export function decideCvParseResult(cv: AnalysedCv, result: { succeeded: boolean; cvVersion: number }): CvAnalysisDecision {
  if (!cv.active || cv.version !== result.cvVersion) return 'IGNORE';
  if (cv.status === 'PENDING_ANALYSIS') return result.succeeded ? 'APPLY_SUCCESS' : 'APPLY_FAILURE';
  if (cv.status === 'ANALYSIS_FAILED' && result.succeeded) return 'APPLY_SUCCESS';
  return 'IGNORE';
}
