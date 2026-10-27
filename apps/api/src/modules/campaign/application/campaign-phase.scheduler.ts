import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { CampaignStatus } from '@srm/shared';
import type { Pool } from 'pg';
import { Clock } from '../../../common/clock/index.js';
import { loadEnv } from '../../../common/config/env.js';
import { RowVersionConflictError } from '../../../common/errors/index.js';
import { ADVISORY_LOCK_KEYS, withAdvisoryLock } from '../../../common/scheduling/advisory-lock.js';
import { PG_POOL } from '../../../db/tokens.js';
import { nextAutoTransition } from '../domain/next-auto-transition.js';
import { CampaignRepository } from '../infrastructure/campaign.repository.js';
import { CampaignService } from './campaign.service.js';

export interface PhaseRunReport {
  /** False when another instance held the advisory lock; nothing was done. */
  acquired: boolean;
  transitions: { campaignId: number; from: CampaignStatus; to: CampaignStatus }[];
}

/**
 * Moves campaigns to the next phase when a deadline passes (US-1.4 AC-6, AC-7). Runs every minute
 * under a PostgreSQL advisory lock, so only one API instance works at a time; each move goes
 * through `transitionTo` with the SYSTEM actor and the row_version read during the scan.
 */
@Injectable()
export class CampaignPhaseScheduler {
  private readonly logger = new Logger(CampaignPhaseScheduler.name);
  private readonly enabled = loadEnv().SCHEDULER_ENABLED;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly repository: CampaignRepository,
    private readonly campaigns: CampaignService,
    private readonly clock: Clock,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'campaign-phase', waitForCompletion: true })
  async tick(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(`campaign phase run failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** One pass over the campaigns. Running it again right after changes nothing (idempotent). */
  async runOnce(): Promise<PhaseRunReport> {
    const run = await withAdvisoryLock(this.pool, ADVISORY_LOCK_KEYS.CAMPAIGN_PHASE, () => this.advanceDue());
    return run.acquired ? { acquired: true, transitions: run.result } : { acquired: false, transitions: [] };
  }

  private async advanceDue(): Promise<PhaseRunReport['transitions']> {
    const now = this.clock.now();
    const done: PhaseRunReport['transitions'] = [];
    for (const campaign of await this.repository.listInAutoPhases()) {
      let { status, rowVersion } = campaign;
      // A campaign several deadlines behind (e.g. the API was down) catches up one phase at a time,
      // each with its own audit entry and event. The loop ends: every step moves forward.
      for (let due = nextAutoTransition(status, campaign.phaseDeadlines, now); due; ) {
        try {
          const result = await this.campaigns.advanceByDeadline(campaign.id, due, rowVersion);
          done.push({ campaignId: campaign.id, from: result.from, to: result.to });
          status = result.to;
          rowVersion = result.rowVersion;
        } catch (error) {
          // Edited or moved since the scan: the next run reads it again.
          if (!(error instanceof RowVersionConflictError)) {
            this.logger.error(
              `campaign ${campaign.id}: ${due.from} -> ${due.to} failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
          break;
        }
        due = nextAutoTransition(status, campaign.phaseDeadlines, now);
      }
    }
    return done;
  }
}
