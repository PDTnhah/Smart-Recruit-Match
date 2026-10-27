import { defineMachine } from './machine.js';

/** Campaign phases, PRD GĐ0: Nháp → Mở nhận JD/CV → Chọn nguyện vọng → Làm test → Phân bổ & HR duyệt → Vòng bổ sung → Đã đóng. */
export const CAMPAIGN_STATES = [
  'DRAFT',
  'INTAKE',
  'PREFERENCE_SELECTION',
  'TESTING',
  'ALLOCATION_REVIEW',
  'SUPPLEMENTARY',
  'CLOSED',
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATES)[number];

export const campaignMachine = defineMachine<CampaignStatus>({
  name: 'campaign',
  states: CAMPAIGN_STATES,
  initial: 'DRAFT',
  transitions: {
    DRAFT: ['INTAKE'],
    INTAKE: ['PREFERENCE_SELECTION'],
    PREFERENCE_SELECTION: ['TESTING'],
    TESTING: ['ALLOCATION_REVIEW'],
    ALLOCATION_REVIEW: ['SUPPLEMENTARY'],
    SUPPLEMENTARY: ['CLOSED'],
    CLOSED: [],
  },
});
