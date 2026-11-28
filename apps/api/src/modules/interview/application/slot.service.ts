import { Injectable } from '@nestjs/common';
import type { CampaignConfig, JdSlots } from '@srm/shared';
import { Clock } from '../../../common/clock/index.js';
import { ADVISORY_LOCK_KEYS, lockEntityInTx } from '../../../common/scheduling/advisory-lock.js';
import type { DbTx } from '../../../db/types.js';
import { NominationService, type PublishedNomination } from '../../allocation/index.js';
import { type Actor, AuditService, SYSTEM_ACTOR } from '../../audit/index.js';
import { type AllocationJd, JdService } from '../../company/index.js';
import { PreferenceReviewService, type ReviewedPreferenceStatus } from '../../matching/index.js';
import type { PendingNotifications } from '../../notification/index.js';
import { INTERVIEW_AUDIT_ACTIONS, INTERVIEW_REASONS, OFFER_ENTITY } from '../domain/audit-actions.js';
import { addCalendarDays, freePlaces, isFilled } from '../domain/slot-policy.js';
import { InterviewRepository, type OfferRecord } from '../infrastructure/interview.repository.js';
import { InterviewNoticeService } from './interview-notices.js';

type MovableStatus = ReviewedPreferenceStatus & ('PASSED' | 'RESERVE' | 'INTERVIEW_FAILED' | 'ACCEPTED' | 'DECLINED' | 'CLOSED');

/**
 * The places of a JD (BR-14…BR-16, US-5.4): every change to them runs under `lock(tx, jdId)`
 * (`pg_advisory_xact_lock(5_401, hashtext(jdId))`, AGENTS › Invariant 11), the first lock its
 * transaction takes, so two results, answers or expiries of one JD run one after the other and the
 * counts below are always those the change applies to. The interview module may not lock the JD's
 * row of the company module (Invariant 13), hence the advisory lock.
 */
@Injectable()
export class SlotService {
  constructor(
    private readonly clock: Clock,
    private readonly repository: InterviewRepository,
    private readonly nominations: NominationService,
    private readonly preferences: PreferenceReviewService,
    private readonly jds: JdService,
    private readonly audit: AuditService,
    private readonly notices: InterviewNoticeService,
  ) {}

  lock(tx: DbTx, jdId: number): Promise<void> {
    return lockEntityInTx(tx, ADVISORY_LOCK_KEYS.JD_SLOTS, jdId);
  }

  async facts(tx: DbTx, jd: AllocationJd): Promise<JdSlots> {
    return { quota: jd.quota, ...(await this.nominations.slotCounts(jd.jdId, { tx })) };
  }

  /**
   * The nomination, locked in `tx` by the caller, and its preference move together (AD-8, CONTEXT
   * D64). Returns the nomination's new row version.
   */
  async move(tx: DbTx, nomination: PublishedNomination, to: MovableStatus, actor: Actor, reason: string): Promise<number> {
    const rowVersion = await this.nominations.transition(nomination.id, to, nomination.rowVersion, actor, reason, { tx });
    await this.preferences.followNomination(nomination.preferenceId, to, actor, reason, { tx });
    return rowVersion;
  }

  /** AC-5: the offer of a nomination that just turned PASSED; its deadline is the server's now + T_offer. */
  async sendOffer(tx: DbTx, nominationId: number, config: CampaignConfig, actor: Actor): Promise<OfferRecord> {
    const sentAt = this.clock.now();
    const offer = await this.repository.insertOffer(tx, {
      nominationId,
      sentAt,
      expiresAt: addCalendarDays(sentAt, config.t_offer_days),
    });
    await this.audit.record(tx, {
      actor,
      action: INTERVIEW_AUDIT_ACTIONS.OFFER_SENT,
      entity: OFFER_ENTITY,
      entityId: offer.id,
      after: { nominationId, sentAt: offer.sentAt.toISOString(), expiresAt: offer.expiresAt.toISOString() },
    });
    return offer;
  }

  /**
   * AC-7 (CONTEXT D66): while the JD has a place neither accepted nor offered, the RESERVE ranked
   * first (S_final, then the tie-breaks of US-5.1, as `listPublishedOfJd` orders them) turns PASSED
   * and gets an offer. A fixed rule, not a decision (BR-13); HR hears it with the answer.
   */
  async promoteReserves(
    tx: DbTx,
    jd: AllocationJd,
    config: CampaignConfig,
  ): Promise<{ promoted: PublishedNomination[]; notices: PendingNotifications[] }> {
    const promoted: PublishedNomination[] = [];
    const notices: PendingNotifications[] = [];
    while (freePlaces(await this.facts(tx, jd)) > 0) {
      const top = (await this.nominations.listPublishedOfJd(jd.jdId, { tx })).find((item) => item.status === 'RESERVE');
      const locked = top && (await this.nominations.findPublished(top.id, { tx, lock: 'update' }));
      if (locked?.status !== 'RESERVE') break;
      // AC-9: a reserve past reserve_ttl_days is over even when the sweep has not closed it yet.
      if (await this.reserveExpired(tx, locked.id, config)) {
        notices.push(...(await this.closeReserve(tx, locked, jd, 'RESERVE_EXPIRED')));
        continue;
      }
      await this.move(tx, locked, 'PASSED', SYSTEM_ACTOR, INTERVIEW_REASONS.PROMOTED);
      const offer = await this.sendOffer(tx, locked.id, config, SYSTEM_ACTOR);
      promoted.push(locked);
      notices.push(...(await this.notices.result(tx, locked, jd, 'PASSED', true, offer)));
    }
    return { promoted, notices };
  }

  /** AC-9 (CONTEXT D66): the reserve's time, `reserve_ttl_days` from HR's result, is up by the server's clock. */
  async reserveExpired(tx: DbTx, nominationId: number, config: CampaignConfig): Promise<boolean> {
    const interview = await this.repository.interviewOfNomination(nominationId, tx);
    if (!interview?.resultAt) return false;
    return this.clock.now().getTime() >= addCalendarDays(interview.resultAt, config.reserve_ttl_days).getTime();
  }

  /** AC-9: a RESERVE, locked by the caller, closes; its student is back in the queue and hears why. */
  async closeReserve(
    tx: DbTx,
    nomination: PublishedNomination,
    jd: AllocationJd,
    reason: 'RESERVE_EXPIRED' | 'JD_FILLED',
  ): Promise<PendingNotifications[]> {
    await this.move(tx, nomination, 'CLOSED', SYSTEM_ACTOR, INTERVIEW_REASONS[reason]);
    return this.notices.reserveClosed(tx, nomination, jd, reason);
  }

  /**
   * BR-15, AC-6, AC-9: once the JD has accepted its quota no place can be freed again, so the JD
   * turns FILLED (through the company module) and every RESERVE of it closes. Nothing when not full.
   */
  async closeIfFilled(tx: DbTx, jd: AllocationJd): Promise<{ filled: boolean; notices: PendingNotifications[] }> {
    if (!isFilled(await this.facts(tx, jd))) return { filled: false, notices: [] };
    await this.jds.markFilled(jd.jdId, SYSTEM_ACTOR, { tx });
    const notices: PendingNotifications[] = [];
    for (const reserve of (await this.nominations.listPublishedOfJd(jd.jdId, { tx })).filter((item) => item.status === 'RESERVE')) {
      const locked = await this.nominations.findPublished(reserve.id, { tx, lock: 'update' });
      if (locked?.status === 'RESERVE') notices.push(...(await this.closeReserve(tx, locked, jd, 'JD_FILLED')));
    }
    return { filled: true, notices };
  }
}
