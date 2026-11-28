import { defineMachine } from './machine.js';

/**
 * Lifecycle of an internship offer, sent when a nomination turns PASSED (PRD GĐ9 step 3, FR-31,
 * US-5.4): the student accepts or declines before `expires_at`, which the server sets (T_offer);
 * past it, the sweep expires the offer. Each response is final. The nomination of a declined or an
 * expired offer is DECLINED either way (CONTEXT D64, D66); the offer tells the two apart (BR-16).
 */
export const OFFER_STATES = ['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED'] as const;

export type OfferStatus = (typeof OFFER_STATES)[number];

export const offerMachine = defineMachine<OfferStatus>({
  // Also the audit entity of an offer.
  name: 'offer',
  states: OFFER_STATES,
  initial: 'PENDING',
  transitions: {
    PENDING: ['ACCEPTED', 'DECLINED', 'EXPIRED'],
    ACCEPTED: [],
    DECLINED: [],
    EXPIRED: [],
  },
});

/** The answers of a student, or of the clock (`EXPIRED`). */
export const OFFER_RESPONSES = ['ACCEPTED', 'DECLINED', 'EXPIRED'] as const satisfies readonly OfferStatus[];

export type OfferResponse = (typeof OFFER_RESPONSES)[number];

export const OFFER_STATUS_LABELS: Readonly<Record<OfferStatus, string>> = {
  PENDING: 'Chờ sinh viên trả lời',
  ACCEPTED: 'Đã nhận',
  DECLINED: 'Đã từ chối',
  EXPIRED: 'Quá hạn',
};
