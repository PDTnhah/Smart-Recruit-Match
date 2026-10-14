// Events of the company module, published with @nestjs/event-emitter after the transaction commits
// (CONTEXT D28). Listeners should declare `{ async: true }` so they never affect the JD change.

/** DRAFT → PENDING_HR_CONFIRMATION. US-2.3 sends `ai.jd.analyze` for this JD version. */
export const JD_SUBMITTED = 'jd.submitted';

/** PENDING_APPROVAL → APPROVED. US-4.1 generates the question bank. */
export const JD_APPROVED = 'jd.approved';

export interface JdEvent {
  jdId: number;
  campaignId: number;
  companyId: number;
  /** JD content version (BR-18); analysis results are matched against it. */
  version: number;
}
