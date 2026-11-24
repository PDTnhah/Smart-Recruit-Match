import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Pool } from 'pg';
import { Clock } from '../../../common/clock/index.js';
import { loadEnv } from '../../../common/config/env.js';
import { errorMessage } from '../../../common/errors/index.js';
import { ADVISORY_LOCK_KEYS, withAdvisoryLock } from '../../../common/scheduling/advisory-lock.js';
import { PG_POOL } from '../../../db/tokens.js';
import { NominationService, type ReviewGroup } from '../../allocation/index.js';
import { type CampaignSettings, CampaignService } from '../../campaign/index.js';
import { type AllocationJd, JdService } from '../../company/index.js';
import { UserDirectory } from '../../iam/index.js';
import { DEDUPE_KEYS, NotificationService } from '../../notification/index.js';
import { REVIEW_PHASES } from '../domain/audit-actions.js';
import { reviewSlaState } from '../domain/working-days.js';
import { deadlineKey } from '../infrastructure/review.repository.js';
import { ReviewDeadlineService } from './review-deadline.service.js';

export interface ReviewSlaSweepReport {
  /** False when another instance held the advisory lock; nothing was done. */
  acquired: boolean;
  /** `deadlineKey`s HR was reminded of in this run (new rows only). */
  reminded: string[];
  /** `deadlineKey`s reported overdue to HR and the center in this run (new rows only). */
  overdue: string[];
}

/**
 * HR's review deadline, every 10 minutes (GĐ8 step 4, FR-29, US-5.3 AC-10, CONTEXT D65): for each
 * JD of a published round with nominations still NOMINATED, 2 working days before the deadline HR
 * of the company is reminded once; from the deadline on, HR and the center hear it is overdue, once.
 * In the app only. The dedupe key holds the deadline, so an extension is reminded again; the
 * advisory lock keeps two instances from sending at once. A passed deadline decides nothing (BR-13).
 * Off when SCHEDULER_ENABLED is false (tests call `runOnce()`).
 */
@Injectable()
export class ReviewSlaScheduler {
  private readonly logger = new Logger(ReviewSlaScheduler.name);
  private readonly enabled = loadEnv().SCHEDULER_ENABLED;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly clock: Clock,
    private readonly nominations: NominationService,
    private readonly deadlines: ReviewDeadlineService,
    private readonly campaigns: CampaignService,
    private readonly jds: JdService,
    private readonly users: UserDirectory,
    private readonly notifications: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'review-sla', waitForCompletion: true })
  async tick(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(`review SLA sweep failed: ${errorMessage(error)}`);
    }
  }

  async runOnce(): Promise<ReviewSlaSweepReport> {
    const run = await withAdvisoryLock(this.pool, ADVISORY_LOCK_KEYS.REVIEW_SLA, () => this.sweep());
    return run.acquired ? { acquired: true, ...run.result } : { acquired: false, reminded: [], overdue: [] };
  }

  private async sweep(): Promise<Omit<ReviewSlaSweepReport, 'acquired'>> {
    const report = { reminded: [] as string[], overdue: [] as string[] };
    const campaigns = new Map<number, CampaignSettings>();
    const groups: ReviewGroup[] = [];
    for (const group of await this.nominations.reviewGroups({ pendingOnly: true })) {
      let campaign = campaigns.get(group.campaignId);
      if (!campaign) {
        campaign = await this.campaigns.getSettings(group.campaignId);
        campaigns.set(campaign.id, campaign);
      }
      // A closed or cancelled campaign is over (LESSONS §48): its rounds need no answer any more.
      if (REVIEW_PHASES.includes(campaign.status)) groups.push(group);
    }
    if (groups.length === 0) return report;
    const now = this.clock.now();
    const deadlines = await this.deadlines.deadlinesOf(groups);
    const jds = new Map((await this.jds.listAllocationJds([...new Set(groups.map((g) => g.jdId))])).map((jd) => [jd.jdId, jd]));
    for (const group of groups) {
      const key = deadlineKey(group.roundId, group.jdId);
      const jd = jds.get(group.jdId);
      const dueAt = deadlines.get(key)!.dueAt;
      const state = reviewSlaState(now, dueAt);
      if (!jd || state === 'OPEN') continue;
      try {
        const created =
          state === 'OVERDUE'
            ? await this.notifyOverdue(group, campaigns.get(group.campaignId)!, jd, dueAt)
            : await this.notifyDueSoon(group, campaigns.get(group.campaignId)!, jd, dueAt);
        if (created > 0) (state === 'OVERDUE' ? report.overdue : report.reminded).push(key);
      } catch (error) {
        // The next run tries again; the dedupe key keeps what was sent from being sent twice.
        this.logger.error(`round ${group.roundId}, JD ${group.jdId}: SLA notice not sent: ${errorMessage(error)}`);
      }
    }
    return report;
  }

  private async notifyDueSoon(group: ReviewGroup, campaign: CampaignSettings, jd: AllocationJd, dueAt: Date): Promise<number> {
    const userIds = await this.users.hrUserIdsOfCompany(jd.companyId);
    if (userIds.length === 0) return 0;
    const pending = await this.notifications.notify({
      type: 'HR_REVIEW_DUE_SOON',
      payload: {
        campaignId: campaign.id,
        campaignName: campaign.name,
        roundNo: group.roundNo,
        jd: { jdId: jd.jdId, title: jd.title, companyName: jd.companyName },
        dueAt: dueAt.toISOString(),
        pendingCount: group.pendingCount,
      },
      userIds,
      channels: ['IN_APP'],
      dedupeKey: DEDUPE_KEYS.hrReviewDueSoon(group.roundId, group.jdId, dueAt),
    });
    return pending.count;
  }

  private async notifyOverdue(group: ReviewGroup, campaign: CampaignSettings, jd: AllocationJd, dueAt: Date): Promise<number> {
    const base = {
      campaignId: campaign.id,
      campaignName: campaign.name,
      roundId: group.roundId,
      roundNo: group.roundNo,
      jd: { jdId: jd.jdId, title: jd.title, companyName: jd.companyName },
      dueAt: dueAt.toISOString(),
      pendingCount: group.pendingCount,
    };
    const dedupeKey = DEDUPE_KEYS.hrReviewOverdue(group.roundId, group.jdId, dueAt);
    let created = 0;
    for (const [audience, userIds] of [
      ['HR', await this.users.hrUserIdsOfCompany(jd.companyId)],
      ['CENTER', await this.users.centerUserIds()],
    ] as const) {
      if (userIds.length === 0) continue;
      const pending = await this.notifications.notify({
        type: 'HR_REVIEW_OVERDUE',
        payload: { audience, ...base },
        userIds,
        channels: ['IN_APP'],
        dedupeKey,
      });
      created += pending.count;
    }
    return created;
  }
}
