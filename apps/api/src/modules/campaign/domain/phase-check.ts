import {
  CAMPAIGN_DEADLINE_KEYS,
  type CampaignDeadlineKey,
  type CampaignDeadlines,
  type CampaignStatus,
} from '@srm/shared';
import { nextAutoTransition } from './next-auto-transition.js';

export type PhaseCheck = { ok: true } | { ok: false; phaseEndedAt?: string };

/**
 * Whether an action allowed in `allowed` may run now (FR-2, CONTEXT D27). Besides the status, the
 * deadline ending the current phase counts: once it passes, the phase is over even if the
 * scheduler has not moved the campaign yet, so a late upload cannot slip through.
 *
 * Actions of the next phase still wait for the actual transition (at most one scheduler tick):
 * they rely on what happens at the transition, e.g. matching runs on INTAKE → PREFERENCE_SELECTION
 * before any student can choose preferences (US-3.2).
 */
export function checkPhase(
  status: CampaignStatus,
  deadlines: CampaignDeadlines,
  allowed: readonly CampaignStatus[],
  now: Date,
): PhaseCheck {
  if (!allowed.includes(status)) return { ok: false };
  const due = nextAutoTransition(status, deadlines, now);
  return due ? { ok: false, phaseEndedAt: due.deadline } : { ok: true };
}

export type OpenCheck =
  | { ok: true }
  | { ok: false; reasonCode: 'DEADLINES_MISSING' | 'DEADLINE_IN_PAST'; keys: CampaignDeadlineKey[] };

/** A draft can open once every deadline is set and still ahead (US-1.4 AC-5). */
export function checkOpenable(deadlines: CampaignDeadlines, now: Date): OpenCheck {
  const missing = CAMPAIGN_DEADLINE_KEYS.filter((key) => deadlines[key] === undefined);
  if (missing.length > 0) return { ok: false, reasonCode: 'DEADLINES_MISSING', keys: missing };
  const past = CAMPAIGN_DEADLINE_KEYS.filter((key) => Date.parse(deadlines[key] ?? '') <= now.getTime());
  if (past.length > 0) return { ok: false, reasonCode: 'DEADLINE_IN_PAST', keys: past };
  return { ok: true };
}
