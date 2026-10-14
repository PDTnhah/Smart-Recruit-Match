// Events of the student module, published with @nestjs/event-emitter after the transaction commits
// (CONTEXT D30). Listeners should declare `{ async: true }` so they never affect the upload.

/** A new CV version is stored and awaits analysis. US-2.4 sends `ai.cv.parse` for it. */
export const CV_SUBMITTED = 'cv.submitted';

export interface CvSubmittedEvent {
  /** The `cvs` row of this version; every version has its own row. */
  cvId: number;
  cvVersion: number;
  campaignId: number;
  studentId: number;
}
