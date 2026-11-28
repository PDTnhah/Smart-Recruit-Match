import { Inject, Injectable } from '@nestjs/common';
import type { OfferAnswerResponse, OfferResponse, RowVersionBody } from '@srm/shared';
import type { AuthUser } from '../../../common/auth/index.js';
import { Clock } from '../../../common/clock/index.js';
import { OfferAlreadyAnsweredError, OfferExpiredError, RowVersionConflictError } from '../../../common/errors/index.js';
import { StateTransitionService } from '../../../common/state/index.js';
import { offerLifecycle } from '../../../db/lifecycles.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import type { PublishedNomination } from '../../allocation/index.js';
import { type Actor, SYSTEM_ACTOR, userActor } from '../../audit/index.js';
import { CampaignService } from '../../campaign/index.js';
import type { AllocationJd } from '../../company/index.js';
import { PreferenceReviewService } from '../../matching/index.js';
import type { PendingNotifications } from '../../notification/index.js';
import { INTERVIEW_PHASES, INTERVIEW_REASONS, OFFER_ENTITY } from '../domain/audit-actions.js';
import { InterviewRepository, type OfferRecord } from '../infrastructure/interview.repository.js';
import { InterviewAccessService } from './interview-access.js';
import { InterviewNoticeService } from './interview-notices.js';
import { SlotService } from './slot.service.js';
import { offerView } from './views.js';

/** What an expiry run did with one offer. */
export type OfferExpiryOutcome = 'EXPIRED' | 'SKIPPED';

/**
 * The student's answer to an offer (GĐ9 step 3, FR-31, US-5.4 AC-6…AC-8, BR-15, BR-16) and its
 * expiry. Each runs in one transaction under the JD's slot lock, then the offer's row lock: the
 * offer is still PENDING and, for the student, before `expires_at` by the server's clock. Accept and
 * the expiry sweep therefore take turns on the same row, and only one answer is ever written (AC-8).
 */
@Injectable()
export class OfferService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly clock: Clock,
    private readonly repository: InterviewRepository,
    private readonly access: InterviewAccessService,
    private readonly slots: SlotService,
    private readonly preferences: PreferenceReviewService,
    private readonly campaigns: CampaignService,
    private readonly transitions: StateTransitionService,
    private readonly notices: InterviewNoticeService,
  ) {}

  /**
   * AC-6 (BR-15): the offer ACCEPTED, the nomination and its preference ACCEPTED, every other
   * preference of the student in the campaign CLOSED, so the student leaves the queue and is placed.
   * The JD's remaining quota is one less; when none is left the JD turns FILLED and its reserves close.
   */
  async accept(user: AuthUser, offerId: number, request: RowVersionBody): Promise<OfferAnswerResponse> {
    return this.answer(user, offerId, request, 'ACCEPTED');
  }

  /** AC-7 (BR-16): the offer DECLINED, the nomination DECLINED; the freed place goes to the first reserve. */
  async decline(user: AuthUser, offerId: number, request: RowVersionBody): Promise<OfferAnswerResponse> {
    return this.answer(user, offerId, request, 'DECLINED');
  }

  /**
   * AC-7, AC-8: the sweep's expiry of one offer past `expires_at`. Under the same locks as an answer,
   * so an offer the student answered first is skipped, and one expired first refuses the answer.
   */
  async expire(offerId: number): Promise<OfferExpiryOutcome> {
    const offer = await this.repository.findOffer(offerId);
    const context = offer?.status === 'PENDING' ? await this.access.contextOf(offer.nominationId) : undefined;
    if (!context) return 'SKIPPED';
    const { outcome, pending } = await this.db.transaction(async (tx) => {
      await this.slots.lock(tx, context.jd.jdId);
      const campaign = await this.campaigns.getSettings(context.nomination.campaignId, { tx });
      // A closed or cancelled campaign is over (LESSONS §48): its offers stay as they are.
      if (!INTERVIEW_PHASES.includes(campaign.status)) return { outcome: 'SKIPPED' as const, pending: [] };
      const locked = await this.repository.findOffer(offerId, { tx, lock: 'update' });
      const now = this.clock.now();
      if (locked?.status !== 'PENDING' || locked.expiresAt.getTime() > now.getTime()) return { outcome: 'SKIPPED' as const, pending: [] };
      const notices = await this.release(tx, locked, context.jd, campaign.config, 'EXPIRED', SYSTEM_ACTOR, locked.expiresAt);
      return { outcome: 'EXPIRED' as const, pending: notices.pending };
    });
    await this.notices.push(pending, `offer ${offerId}`);
    return outcome;
  }

  private async answer(
    user: AuthUser,
    offerId: number,
    request: RowVersionBody,
    response: Extract<OfferResponse, 'ACCEPTED' | 'DECLINED'>,
  ): Promise<OfferAnswerResponse> {
    const { nomination, jd } = await this.access.offer(user, offerId); // 404 before any lock
    const actor = userActor(user);
    const { result, pending } = await this.db.transaction(async (tx) => {
      await this.slots.lock(tx, jd.jdId);
      const campaign = await this.campaigns.assertPhase(nomination.campaignId, INTERVIEW_PHASES, { tx });
      const { offer } = await this.access.offer(user, offerId, { tx, lock: 'update' });
      if (offer.rowVersion !== request.rowVersion) {
        throw new RowVersionConflictError(OFFER_ENTITY, offerId, request.rowVersion, offer.rowVersion);
      }
      if (offer.status !== 'PENDING') throw new OfferAlreadyAnsweredError(offerId, offer.status);
      const now = this.clock.now();
      // AC-8: the server's clock decides; past the deadline the answer is refused and nothing moves.
      if (now.getTime() >= offer.expiresAt.getTime()) throw new OfferExpiredError(offerId, offer.expiresAt);
      return response === 'ACCEPTED'
        ? this.acceptInTx(tx, offer, jd, actor, now)
        : this.release(tx, offer, jd, campaign.config, 'DECLINED', actor, now);
    });
    await this.notices.push(pending, `offer ${offerId}`);
    return result;
  }

  private async acceptInTx(
    tx: DbTx,
    offer: OfferRecord,
    jd: AllocationJd,
    actor: Actor,
    now: Date,
  ): Promise<{ result: OfferAnswerResponse; pending: PendingNotifications[] }> {
    const rowVersion = await this.answerOffer(tx, offer, 'ACCEPTED', actor, INTERVIEW_REASONS.OFFER_ACCEPTED, now);
    const nomination = await this.lockedNomination(tx, offer);
    await this.slots.move(tx, nomination, 'ACCEPTED', actor, INTERVIEW_REASONS.OFFER_ACCEPTED);
    await this.preferences.closeOtherPreferences(
      nomination.studentId,
      nomination.campaignId,
      nomination.preferenceId,
      SYSTEM_ACTOR,
      INTERVIEW_REASONS.ACCEPTED_ELSEWHERE,
      { tx },
    );
    const filled = await this.slots.closeIfFilled(tx, jd);
    const answered = await this.notices.offerAnswered(tx, {
      offer,
      nomination,
      jd,
      response: 'ACCEPTED',
      promoted: [],
      jdFilled: filled.filled,
    });
    return {
      result: {
        offer: offerView({ ...offer, status: 'ACCEPTED', respondedAt: now, rowVersion }),
        nominationStatus: 'ACCEPTED',
      },
      pending: [...answered, ...filled.notices],
    };
  }

  /**
   * AC-7: a declined or expired offer frees its place. The nomination turns DECLINED either way
   * (CONTEXT D64, D66; the offer keeps which); the student is back in the queue with the other
   * preferences, marked for Q4 by that DECLINED nomination (BR-16, applied by US-5.5). The first
   * reserve of the JD takes the place and gets an offer; with no reserve it stays free.
   */
  private async release(
    tx: DbTx,
    offer: OfferRecord,
    jd: AllocationJd,
    config: Parameters<SlotService['promoteReserves']>[2],
    response: Extract<OfferResponse, 'DECLINED' | 'EXPIRED'>,
    actor: Actor,
    respondedAt: Date,
  ): Promise<{ result: OfferAnswerResponse; pending: PendingNotifications[] }> {
    const reason = response === 'DECLINED' ? INTERVIEW_REASONS.OFFER_DECLINED : INTERVIEW_REASONS.OFFER_EXPIRED;
    const rowVersion = await this.answerOffer(tx, offer, response, actor, reason, respondedAt);
    const nomination = await this.lockedNomination(tx, offer);
    await this.slots.move(tx, nomination, 'DECLINED', actor, reason);
    const { promoted, notices } = await this.slots.promoteReserves(tx, jd, config);
    const answered = await this.notices.offerAnswered(tx, { offer, nomination, jd, response, promoted, jdFilled: false });
    return {
      result: { offer: offerView({ ...offer, status: response, respondedAt, rowVersion }), nominationStatus: 'DECLINED' },
      pending: [...answered, ...notices],
    };
  }

  private async answerOffer(
    tx: DbTx,
    offer: OfferRecord,
    to: OfferResponse,
    actor: Actor,
    reason: string,
    respondedAt: Date,
  ): Promise<number> {
    const { rowVersion } = await this.transitions.transitionTo({
      lifecycle: offerLifecycle,
      id: offer.id,
      to,
      actor,
      reason,
      expectedRowVersion: offer.rowVersion,
      set: { respondedAt },
      tx,
    });
    return rowVersion;
  }

  /** The offer's nomination, locked in `tx` (the caller's access is checked already); PASSED while the offer is PENDING. */
  private async lockedNomination(tx: DbTx, offer: OfferRecord): Promise<PublishedNomination> {
    const context = await this.access.contextOf(offer.nominationId, { tx, lock: 'update' });
    if (!context) throw new Error(`offer ${offer.id}: nomination ${offer.nominationId} is not in a published round`);
    return context.nomination;
  }
}
