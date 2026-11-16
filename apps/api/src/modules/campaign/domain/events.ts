import type { CampaignConfig, CampaignStatus, CampaignTarget } from '@srm/shared';
import type { DeadlineMove } from './running-edit.js';

// Events of the campaign module, published with @nestjs/event-emitter after the transaction commits
// (CONTEXT D27). Listeners in other modules (notification, matching…) subscribe with @OnEvent and
// should declare `{ async: true }` so a slow or failing listener never affects the campaign change.

/** A draft campaign was opened (DRAFT → INTAKE). US-1.7 notifies the target students. */
export const CAMPAIGN_OPENED = 'campaign.opened';

/** Every phase change, manual or by deadline. US-3.2 and US-3.3 react to specific edges. */
export const CAMPAIGN_PHASE_CHANGED = 'campaign.phase_changed';

/**
 * A campaign that has left DRAFT was edited (US-1.10, CONTEXT D56). Matching scores S_cv again on a
 * weight change; students added to the target get the opening notice; students and HR are told of
 * moved deadlines. Edits of a draft publish nothing.
 */
export const CAMPAIGN_UPDATED = 'campaign.updated';

/**
 * The center cancelled a campaign (US-1.10 AC-6), published after `campaign.phase_changed`. Students
 * of the target and HR of companies with a JD in it are told why.
 */
export const CAMPAIGN_CANCELLED = 'campaign.cancelled';

export interface CampaignOpenedEvent {
  campaignId: number;
}

export interface CampaignPhaseChangedEvent {
  campaignId: number;
  from: CampaignStatus;
  to: CampaignStatus;
  /** `SYSTEM` when the scheduler moved the campaign at a deadline. */
  actorKind: 'USER' | 'SYSTEM';
}

export interface CampaignUpdatedEvent {
  campaignId: number;
  /** row_version after the edit: one edit, one notice (US-1.10 AC-5). */
  rowVersion: number;
  /**
   * The target before the edit when it added cohorts or majors, else null. Its students already
   * knew the campaign; those added hear of it as opened, with the new deadlines (US-1.10 AC-3, AC-5).
   */
  targetBefore: CampaignTarget | null;
  /** Parameters that changed. */
  configKeys: (keyof CampaignConfig)[];
  deadlines: DeadlineMove[];
  reason: string;
}

export interface CampaignCancelledEvent {
  campaignId: number;
  reason: string;
}
