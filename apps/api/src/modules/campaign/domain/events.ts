import type { CampaignStatus } from '@srm/shared';

// Events of the campaign module, published with @nestjs/event-emitter after the transaction commits
// (CONTEXT D27). Listeners in other modules (notification, matching…) subscribe with @OnEvent and
// should declare `{ async: true }` so a slow or failing listener never affects the campaign change.

/** A draft campaign was opened (DRAFT → INTAKE). US-1.7 notifies the target students. */
export const CAMPAIGN_OPENED = 'campaign.opened';

/** Every phase change, manual or by deadline. US-3.2 and US-3.3 react to specific edges. */
export const CAMPAIGN_PHASE_CHANGED = 'campaign.phase_changed';

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
