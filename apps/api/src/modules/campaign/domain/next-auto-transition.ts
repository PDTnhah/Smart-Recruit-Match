import type { CampaignDeadlines, CampaignStatus } from '@srm/shared';
import { type AutoEdge, autoEdgeFrom } from './phase.js';

export interface DueTransition extends AutoEdge {
  /** The deadline that has passed, as stored (ISO 8601). */
  deadline: string;
}

/**
 * The automatic transition a campaign is due for at `now`, or null. A phase ends at its deadline:
 * `now >= deadline` moves the campaign on. Phases without an automatic edge, or whose deadline is
 * not set, never move here.
 */
export function nextAutoTransition(
  status: CampaignStatus,
  deadlines: CampaignDeadlines,
  now: Date,
): DueTransition | null {
  const edge = autoEdgeFrom(status);
  if (!edge) return null;
  const deadline = deadlines[edge.deadlineKey];
  if (deadline === undefined) return null;
  return now.getTime() >= Date.parse(deadline) ? { ...edge, deadline } : null;
}
