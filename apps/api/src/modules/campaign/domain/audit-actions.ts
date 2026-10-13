/** Audit actions written by the campaign module; status changes use `TRANSITION` (AD-8). */
export const CAMPAIGN_AUDIT_ACTIONS = {
  CREATED: 'CAMPAIGN_CREATED',
  /** Any edit of a draft. */
  UPDATED: 'CAMPAIGN_UPDATED',
  /** Deadlines moved later after the campaign left DRAFT; the entry carries the reason. */
  DEADLINES_EXTENDED: 'CAMPAIGN_DEADLINES_EXTENDED',
} as const;
