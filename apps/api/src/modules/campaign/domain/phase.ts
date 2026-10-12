import type { CampaignDeadlineKey, CampaignStatus } from '@srm/shared';

// Which campaign transitions happen by deadline and which by hand (US-1.4 Dev notes, CONTEXT D27).
// PRD GĐ0 only says the campaign "moves by its deadlines"; the split below is the story's proposal.

export interface PhaseEdge {
  from: CampaignStatus;
  to: CampaignStatus;
}

export interface AutoEdge extends PhaseEdge {
  /** The deadline that ends `from`; once it passes the scheduler moves the campaign to `to`. */
  deadlineKey: CampaignDeadlineKey;
}

export const AUTO_EDGES: readonly AutoEdge[] = [
  { from: 'INTAKE', to: 'PREFERENCE_SELECTION', deadlineKey: 'intake_end' },
  { from: 'PREFERENCE_SELECTION', to: 'TESTING', deadlineKey: 'preference_end' },
  { from: 'TESTING', to: 'ALLOCATION_REVIEW', deadlineKey: 'testing_end' },
];

/**
 * Taken by a CENTER user: opening the campaign (US-1.4 AC-5); the supplementary round and closing
 * (GĐ10, US-5.5).
 */
export const MANUAL_EDGES: readonly PhaseEdge[] = [
  { from: 'DRAFT', to: 'INTAKE' },
  { from: 'ALLOCATION_REVIEW', to: 'SUPPLEMENTARY' },
  { from: 'SUPPLEMENTARY', to: 'CLOSED' },
];

/** Statuses the scheduler looks at. */
export const AUTO_PHASES: readonly CampaignStatus[] = AUTO_EDGES.map((edge) => edge.from);

export function autoEdgeFrom(status: CampaignStatus): AutoEdge | undefined {
  return AUTO_EDGES.find((edge) => edge.from === status);
}
