import type { SupplementBlock } from '@srm/shared';

export interface SupplementFacts {
  /** The campaign is in a phase where HR reviews nominations (GĐ8, GĐ10). */
  phaseOpen: boolean;
  /** A round of the campaign has been published. */
  hasPublishedRound: boolean;
  /** HR already asked for this JD in the newest published round. */
  alreadyRequested: boolean;
  /** Nominations of the JD in INTERVIEW, PASSED, RESERVE or ACCEPTED. */
  invitedCount: number;
  quota: number;
}

/**
 * Why HR may not ask for more candidates now, or null when it may (GĐ8 step 3, US-5.3 AC-9): only
 * while fewer students were invited than the quota, once per published round.
 */
export function supplementBlock(facts: SupplementFacts): SupplementBlock | null {
  if (!facts.phaseOpen) return 'PHASE_CLOSED';
  if (!facts.hasPublishedRound) return 'NO_PUBLISHED_ROUND';
  if (facts.invitedCount >= facts.quota) return 'QUOTA_REACHED';
  if (facts.alreadyRequested) return 'ALREADY_REQUESTED';
  return null;
}
