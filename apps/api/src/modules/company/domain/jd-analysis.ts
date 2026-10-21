import type { AiResultStatus, JdAnalysisStatus, JobDescriptionStatus } from '@srm/shared';

// What to do with a JD_ANALYZE result (US-2.3 AC-4, AC-5, AC-6, CONTEXT D33, D35). Pure: the
// listener locks the JD first, so two copies of one result are decided one after the other.

export type AnalysisDecision = 'APPLY_SUCCESS' | 'APPLY_FAILURE' | 'IGNORE';

export interface AnalysedJd {
  status: JobDescriptionStatus;
  version: number;
  analysisStatus: JdAnalysisStatus | null;
  /** Requirements are stored: by an earlier result, or entered by HR by hand. */
  requirementsReady: boolean;
}

/**
 * A result applies only to the JD version it analysed, while that JD still waits for it: awaiting
 * HR confirmation, analysis PENDING, no requirements yet. Everything else is a duplicate, a result
 * for a replaced version, or a late answer after HR typed the requirements; it is ignored without
 * a write or an audit entry (AC-5). Results never change the JD's state (CONTEXT D28).
 */
export function decideAnalysisResult(
  jd: AnalysedJd,
  result: { status: AiResultStatus; jdVersion: number },
): AnalysisDecision {
  const waiting =
    jd.version === result.jdVersion &&
    jd.status === 'PENDING_HR_CONFIRMATION' &&
    jd.analysisStatus === 'PENDING' &&
    !jd.requirementsReady;
  if (!waiting) return 'IGNORE';
  return result.status === 'FAILED' ? 'APPLY_FAILURE' : 'APPLY_SUCCESS';
}
