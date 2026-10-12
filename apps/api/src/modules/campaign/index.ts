// Public entry of the campaign module (CONTEXT D22): other code imports only from here.
export { CampaignModule } from './campaign.module.js';
export { CampaignService, type CampaignSettings } from './application/campaign.service.js';
export { type StudentAudienceLookup } from './application/student-audience.js';
export type { StudentAudience } from './domain/visibility.js';
export {
  CAMPAIGN_OPENED,
  CAMPAIGN_PHASE_CHANGED,
  type CampaignOpenedEvent,
  type CampaignPhaseChangedEvent,
} from './domain/events.js';
