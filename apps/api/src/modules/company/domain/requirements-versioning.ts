import type { CampaignStatus, JdRequirementsEditMode, JobDescriptionStatus } from '@srm/shared';

// Who may change a JD's normalised requirements, and how (US-2.3 AC-8, AC-9, AC-11, BR-02, BR-18,
// CONTEXT D35). Pure: the service locks the JD, reads the campaign and applies the decision.

export type RequirementsEditor = 'HR' | 'CENTER';

/** Codes in `details.reasonCode` of a 409 JD_REQUIREMENTS_NOT_EDITABLE. */
export const REQUIREMENTS_REASON_CODES = {
  /** Still a draft: HR submits it first, then the analysis proposes requirements. */
  NOT_SUBMITTED: 'JD_NOT_SUBMITTED',
  /** HR confirms the requirements of its own JD; the center reads them (AC-9). */
  CONFIRMED_BY_HR: 'REQUIREMENTS_CONFIRMED_BY_HR',
  /** Before confirmation HR edits only while the campaign takes JDs (CONTEXT D28). */
  CAMPAIGN_NOT_IN_INTAKE: 'CAMPAIGN_NOT_IN_INTAKE',
  /** Confirming applies only to a JD awaiting HR confirmation; later edits are versions. */
  NOT_AWAITING_CONFIRMATION: 'JD_NOT_AWAITING_CONFIRMATION',
  /** Confirmed, waiting for the center: there is no edge back to HR (CONTEXT D28). */
  AWAITING_APPROVAL: 'JD_AWAITING_APPROVAL',
  /** The JD or its campaign is over: nothing left to score against. */
  CLOSED: 'JD_CLOSED',
} as const;

export type RequirementsReasonCode = (typeof REQUIREMENTS_REASON_CODES)[keyof typeof REQUIREMENTS_REASON_CODES];

export type RequirementsEdit =
  | { kind: 'IN_PLACE' }
  | { kind: 'NEW_VERSION' }
  | { kind: 'FORBIDDEN'; reasonCode: RequirementsReasonCode };

/**
 * - Awaiting HR confirmation: HR of the company edits in place while the campaign is in INTAKE;
 *   the version stays, nothing has used the requirements yet (AC-11, second case).
 * - Approved or recruiting, campaign not closed: every edit, by HR or the center, creates
 *   version + 1, whether or not testing has started (BR-18, CONTEXT D35). Matching scores and the
 *   question bank may already rest on the current version, so it is never overwritten.
 * - Anything else is read only.
 */
export function decideRequirementsEdit(input: {
  jdStatus: JobDescriptionStatus;
  campaignStatus: CampaignStatus;
  editor: RequirementsEditor;
}): RequirementsEdit {
  const { jdStatus, campaignStatus, editor } = input;
  switch (jdStatus) {
    case 'DRAFT':
      return forbidden('NOT_SUBMITTED');
    case 'PENDING_HR_CONFIRMATION':
      if (editor !== 'HR') return forbidden('CONFIRMED_BY_HR');
      return campaignStatus === 'INTAKE' ? { kind: 'IN_PLACE' } : forbidden('CAMPAIGN_NOT_IN_INTAKE');
    case 'PENDING_APPROVAL':
      return forbidden('AWAITING_APPROVAL');
    case 'APPROVED':
    case 'RECRUITING':
      return campaignStatus === 'CLOSED' ? forbidden('CLOSED') : { kind: 'NEW_VERSION' };
    case 'FILLED':
    case 'CLOSED':
      return forbidden('CLOSED');
  }
}

/** The edit mode the screen offers for a decision. */
export function editModeOf(edit: RequirementsEdit): JdRequirementsEditMode {
  return edit.kind === 'FORBIDDEN' ? 'READ_ONLY' : edit.kind;
}

/** AC-8: confirming is the in-place edit that also moves the JD to PENDING_APPROVAL; HR only. */
export function canConfirm(edit: RequirementsEdit, jdStatus: JobDescriptionStatus): boolean {
  return edit.kind === 'IN_PLACE' && jdStatus === 'PENDING_HR_CONFIRMATION';
}

function forbidden(reason: keyof typeof REQUIREMENTS_REASON_CODES): RequirementsEdit {
  return { kind: 'FORBIDDEN', reasonCode: REQUIREMENTS_REASON_CODES[reason] };
}
