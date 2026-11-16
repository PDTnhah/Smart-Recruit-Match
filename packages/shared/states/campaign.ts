import { defineMachine } from './machine.js';

/**
 * Campaign phases, PRD GĐ0: Nháp → Mở nhận JD/CV → Chọn nguyện vọng → Làm test → Phân bổ & HR duyệt
 * → Vòng bổ sung → Đã đóng. `CANCELLED`: a campaign stopped by the center while it had data
 * (US-1.10, CONTEXT D56); the data stays, nothing runs any more.
 */
export const CAMPAIGN_STATES = [
  'DRAFT',
  'INTAKE',
  'PREFERENCE_SELECTION',
  'TESTING',
  'ALLOCATION_REVIEW',
  'SUPPLEMENTARY',
  'CLOSED',
  'CANCELLED',
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATES)[number];

/** Final states: nothing about the campaign changes any more. */
export const CAMPAIGN_FINAL_STATES = ['CLOSED', 'CANCELLED'] as const satisfies readonly CampaignStatus[];

/**
 * Every open phase may end in `CANCELLED` (US-1.10 AC-6); a draft is deleted instead, a closed
 * campaign is over.
 */
export const campaignMachine = defineMachine<CampaignStatus>({
  name: 'campaign',
  states: CAMPAIGN_STATES,
  initial: 'DRAFT',
  transitions: {
    DRAFT: ['INTAKE'],
    INTAKE: ['PREFERENCE_SELECTION', 'CANCELLED'],
    PREFERENCE_SELECTION: ['TESTING', 'CANCELLED'],
    TESTING: ['ALLOCATION_REVIEW', 'CANCELLED'],
    ALLOCATION_REVIEW: ['SUPPLEMENTARY', 'CANCELLED'],
    SUPPLEMENTARY: ['CLOSED', 'CANCELLED'],
    CLOSED: [],
    CANCELLED: [],
  },
});
