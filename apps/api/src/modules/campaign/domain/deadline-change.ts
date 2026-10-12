import {
  CAMPAIGN_DEADLINE_KEYS,
  type CampaignDeadlineKey,
  type CampaignDeadlines,
  type PhaseDeadlinesInput,
} from '@srm/shared';

export type DeadlineExtension =
  | { ok: true; changed: CampaignDeadlineKey[] }
  /** The deadline has already passed (or was never set): it can no longer move. */
  | { ok: false; kind: 'LOCKED'; keys: CampaignDeadlineKey[] }
  /** Moved earlier or cleared: deadlines may only move later. */
  | { ok: false; kind: 'NOT_LATER'; keys: CampaignDeadlineKey[] };

/**
 * Rules for deadline edits once the campaign has left DRAFT (US-1.4 AC-4, CONTEXT D27): any
 * deadline still ahead may move later, including the one ending the current phase; passed
 * deadlines are locked. Keys sent with their current value are not changes. Keeping the
 * deadlines in phase order is checked on the merged result by PhaseDeadlinesSchema.
 */
export function checkDeadlineExtension(
  before: CampaignDeadlines,
  patch: PhaseDeadlinesInput,
  now: Date,
): DeadlineExtension {
  const changed: CampaignDeadlineKey[] = [];
  const locked: CampaignDeadlineKey[] = [];
  const notLater: CampaignDeadlineKey[] = [];
  for (const key of CAMPAIGN_DEADLINE_KEYS) {
    const next = patch[key];
    if (next === undefined) continue;
    const current = before[key];
    if (current !== undefined && next !== null && Date.parse(next) === Date.parse(current)) continue;
    if (current === undefined || Date.parse(current) <= now.getTime()) locked.push(key);
    else if (next === null || Date.parse(next) < Date.parse(current)) notLater.push(key);
    else changed.push(key);
  }
  if (locked.length > 0) return { ok: false, kind: 'LOCKED', keys: locked };
  if (notLater.length > 0) return { ok: false, kind: 'NOT_LATER', keys: notLater };
  return { ok: true, changed };
}
