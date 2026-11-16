// Public entry of the campaign module (CONTEXT D22): other code imports only from here.
export { CampaignModule } from './campaign.module.js';
export { CampaignService, type CampaignSettings } from './application/campaign.service.js';
export { type StudentAudienceLookup } from './application/student-audience.js';
export { isInTarget, type StudentAudience } from './domain/visibility.js';
export {
  CAMPAIGN_CANCELLED,
  CAMPAIGN_OPENED,
  CAMPAIGN_PHASE_CHANGED,
  CAMPAIGN_UPDATED,
  type CampaignCancelledEvent,
  type CampaignOpenedEvent,
  type CampaignPhaseChangedEvent,
  type CampaignUpdatedEvent,
} from './domain/events.js';
export { type DeadlineMove } from './domain/running-edit.js';
