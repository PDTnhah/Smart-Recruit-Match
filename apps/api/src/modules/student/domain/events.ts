// Events of the student module, published with @nestjs/event-emitter after the transaction commits
// (CONTEXT D30). Listeners should declare `{ async: true }` so they never affect the upload.

/** A new CV version is stored and awaits analysis; CvAnalysisService sends `ai.cv.parse` for it. */
export const CV_SUBMITTED = 'cv.submitted';

export interface CvSubmittedEvent {
  /** The `cvs` row of this version; every version has its own row. */
  cvId: number;
  cvVersion: number;
  campaignId: number;
  studentId: number;
}

/**
 * The analysis of a CV version settled and its state changed (US-2.4, CONTEXT D37). Published after
 * commit; the notification module tells the student and, when needed, the center. The student
 * module cannot call it directly: notification already imports student.
 */
export const CV_ANALYSIS_SETTLED = 'cv.analysis.settled';

export interface CvAnalysisSettledEvent {
  cvId: number;
  cvVersion: number;
  campaignId: number;
  studentId: number;
  status: 'PENDING_CONFIRMATION' | 'ANALYSIS_FAILED';
  /** The file hid text from the reader; the center looks at it either way. */
  hiddenTextDetected: boolean;
  /** Null when the job was never sent (DISPATCH_FAILED). */
  jobId: string | null;
  /** Why the analysis failed; null on success. */
  errorCode: string | null;
}
