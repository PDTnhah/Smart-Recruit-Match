// Events of the company module, published with @nestjs/event-emitter after the transaction commits
// (CONTEXT D28). Listeners should declare `{ async: true }` so they never affect the JD change.

/** DRAFT → PENDING_HR_CONFIRMATION. The JD Analyzer is dispatched for this version (US-2.3). */
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

/**
 * The requirements of an approved JD got a new version (BR-18, US-2.3 AC-11, CONTEXT D35). EPIC-3
 * re-scores the candidates of this JD, EPIC-4 reviews its question bank; both read the new
 * version from `core.v_ai_jd_requirements` or JdService.
 */
export const JD_REQUIREMENTS_VERSIONED = 'jd.requirements.versioned';

export interface JdRequirementsVersionedEvent {
  jdId: number;
  campaignId: number;
  companyId: number;
  fromVersion: number;
  toVersion: number;
}
