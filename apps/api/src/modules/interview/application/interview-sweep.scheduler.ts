import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Pool } from 'pg';
import { Clock } from '../../../common/clock/index.js';
import { loadEnv } from '../../../common/config/env.js';
import { errorMessage } from '../../../common/errors/index.js';
import { ADVISORY_LOCK_KEYS, withAdvisoryLock } from '../../../common/scheduling/advisory-lock.js';
import { DRIZZLE, PG_POOL } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { NominationService } from '../../allocation/index.js';
import { type CampaignSettings, CampaignService } from '../../campaign/index.js';
import type { PendingNotifications } from '../../notification/index.js';
import { INTERVIEW_PHASES } from '../domain/audit-actions.js';
import { isFilled } from '../domain/slot-policy.js';
import { InterviewRepository } from '../infrastructure/interview.repository.js';
import { InterviewAccessService } from './interview-access.js';
import { InterviewNoticeService } from './interview-notices.js';
import { OfferService } from './offer.service.js';
import { SlotService } from './slot.service.js';

export interface InterviewSweepReport {
  /** False when another instance held the advisory lock; nothing was done. */
  acquired: boolean;
  /** Offers expired in this run. */
  expiredOffers: number[];
  /** Nominations whose reserve closed in this run, by why. */
  closedReserves: { nominationId: number; reason: 'RESERVE_EXPIRED' | 'JD_FILLED' }[];
}

/**
 * GĐ9's clock, every minute (ARCHITECTURE › Tác vụ định kỳ, US-5.4 AC-7…AC-9): offers past
 * `expires_at` expire, and their place goes to the first reserve; a RESERVE past `reserve_ttl_days`
 * from HR's result, or of a JD that accepted its quota, closes. One transaction per offer or reserve,
 * under the JD's slot lock, re-checked under the row lock, so a student's answer and the sweep never
 * both win. A failure of one is logged and retried on the next run. Only campaigns in review; off
 * when SCHEDULER_ENABLED is false (tests call `runOnce()`).
 */
@Injectable()
export class InterviewSweepScheduler {
  private readonly logger = new Logger(InterviewSweepScheduler.name);
  private readonly enabled = loadEnv().SCHEDULER_ENABLED;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly clock: Clock,
    private readonly repository: InterviewRepository,
    private readonly nominations: NominationService,
    private readonly campaigns: CampaignService,
    private readonly access: InterviewAccessService,
    private readonly slots: SlotService,
    private readonly offers: OfferService,
    private readonly notices: InterviewNoticeService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'interview-sweep', waitForCompletion: true })
  async tick(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(`interview sweep failed: ${errorMessage(error)}`);
    }
  }

  async runOnce(): Promise<InterviewSweepReport> {
    const run = await withAdvisoryLock(this.pool, ADVISORY_LOCK_KEYS.INTERVIEW_SWEEP, () => this.sweep());
    return run.acquired ? { acquired: true, ...run.result } : { acquired: false, expiredOffers: [], closedReserves: [] };
  }

  private async sweep(): Promise<Omit<InterviewSweepReport, 'acquired'>> {
    const report: Omit<InterviewSweepReport, 'acquired'> = { expiredOffers: [], closedReserves: [] };
    for (const offer of await this.repository.pendingOffersDue(this.clock.now())) {
      try {
        if ((await this.offers.expire(offer.id)) === 'EXPIRED') report.expiredOffers.push(offer.id);
      } catch (error) {
        this.logger.warn(`offer ${offer.id}: not expired: ${errorMessage(error)}`);
      }
    }
    const campaigns = new Map<number, CampaignSettings>();
    for (const reserve of await this.nominations.listPublishedInStatus('RESERVE')) {
      try {
        let campaign = campaigns.get(reserve.campaignId);
        if (!campaign) {
          campaign = await this.campaigns.getSettings(reserve.campaignId);
          campaigns.set(campaign.id, campaign);
        }
        if (!INTERVIEW_PHASES.includes(campaign.status)) continue;
        const reason = await this.closeReserve(reserve.id);
        if (reason) report.closedReserves.push({ nominationId: reserve.id, reason });
      } catch (error) {
        this.logger.warn(`reserve ${reserve.id}: not closed: ${errorMessage(error)}`);
      }
    }
    return report;
  }

  /**
   * AC-9: closes one RESERVE when its time is up or its JD is full, re-checked under the JD's slot
   * lock and the nomination's row lock; the time is read from the campaign in the same transaction.
   */
  private async closeReserve(nominationId: number): Promise<'RESERVE_EXPIRED' | 'JD_FILLED' | null> {
    const context = await this.access.contextOf(nominationId);
    if (!context) return null;
    const { reason, pending } = await this.db.transaction(async (tx) => {
      await this.slots.lock(tx, context.jd.jdId);
      const campaign = await this.campaigns.getSettings(context.nomination.campaignId, { tx });
      // Closed or cancelled since the run read it (LESSONS §48): its records stay as they are.
      if (!INTERVIEW_PHASES.includes(campaign.status)) return { reason: null, pending: [] as PendingNotifications[] };
      const locked = await this.access.contextOf(nominationId, { tx, lock: 'update' });
      if (!locked || locked.nomination.status !== 'RESERVE') return { reason: null, pending: [] as PendingNotifications[] };
      const why = isFilled(await this.slots.facts(tx, context.jd))
        ? ('JD_FILLED' as const)
        : (await this.slots.reserveExpired(tx, nominationId, campaign.config))
          ? ('RESERVE_EXPIRED' as const)
          : null;
      if (!why) return { reason: null, pending: [] as PendingNotifications[] };
      return { reason: why, pending: await this.slots.closeReserve(tx, locked.nomination, context.jd, why) };
    });
    await this.notices.push(pending, `reserve ${nominationId}`);
    return reason;
  }
}
