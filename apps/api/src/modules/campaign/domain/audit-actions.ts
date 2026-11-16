/** Audit actions written by the campaign module; status changes use `TRANSITION` (AD-8). */
export const CAMPAIGN_AUDIT_ACTIONS = {
  CREATED: 'CAMPAIGN_CREATED',
  /** Any edit of a draft. */
  UPDATED: 'CAMPAIGN_UPDATED',
  /**
   * An edit after the campaign left DRAFT (US-1.10); the entry carries the reason. Entries written
   * before US-1.10, when only deadlines could move later, are `CAMPAIGN_DEADLINES_EXTENDED`.
   */
  UPDATED_AFTER_OPEN: 'CAMPAIGN_UPDATED_AFTER_OPEN',
  /** A campaign nothing referred to was deleted (US-1.10 AC-9); the entry keeps its last state. */
  DELETED: 'CAMPAIGN_DELETED',
} as const;
