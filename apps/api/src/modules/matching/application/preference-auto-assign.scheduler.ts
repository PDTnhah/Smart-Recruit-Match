import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Pool } from 'pg';
import { loadEnv } from '../../../common/config/env.js';
import { errorMessage } from '../../../common/errors/index.js';
import { ADVISORY_LOCK_KEYS, withAdvisoryLock } from '../../../common/scheduling/advisory-lock.js';
import { PG_POOL } from '../../../db/tokens.js';
import { CampaignService } from '../../campaign/index.js';
import { AutoAssignPreferencesService } from './auto-assign-preferences.service.js';
import { LowPreferenceAlertService } from './low-preference-alert.service.js';

export interface AutoAssignSweepReport {
  /** False when another instance held the advisory lock; nothing was done. */
  acquired: boolean;
  /** Students given preferences, by campaign; campaigns with none are left out. */
  assigned: Map<number, number[]>;
}

/**
 * Q6 again every 10 minutes for each campaign in TESTING (US-3.3 AC-10, ARCHITECTURE › Tác vụ định
 * kỳ, CONTEXT D47). The run at the phase change is in-process: it may fail, stop with the API, or
 * leave students whose JDs a matching run was still scoring. A sweep serves only students still
 * without a preference, so once everyone is served it changes nothing. When Q6 has nobody left,
 * the sweep also sends the alert of JDs with few preferences (US-3.4 AC-5, LESSONS §34), quiet
 * after the first time thanks to its `dedupe_key`. Under an advisory lock; off when
 * SCHEDULER_ENABLED is false.
 */
@Injectable()
export class PreferenceAutoAssignScheduler {
  private readonly logger = new Logger(PreferenceAutoAssignScheduler.name);
  private readonly enabled = loadEnv().SCHEDULER_ENABLED;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly campaigns: CampaignService,
    private readonly autoAssign: AutoAssignPreferencesService,
    private readonly lowPreferenceAlert: LowPreferenceAlertService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'preference-auto-assign', waitForCompletion: true })
  async tick(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(`preference auto-assignment sweep failed: ${errorMessage(error)}`);
    }
  }

  async runOnce(): Promise<AutoAssignSweepReport> {
    const run = await withAdvisoryLock(this.pool, ADVISORY_LOCK_KEYS.PREFERENCE_AUTO_ASSIGN, () => this.sweep());
    return run.acquired ? { acquired: true, assigned: run.result } : { acquired: false, assigned: new Map() };
  }

  private async sweep(): Promise<Map<number, number[]>> {
    const assigned = new Map<number, number[]>();
    for (const campaign of await this.campaigns.listSettingsInPhase('TESTING')) {
      try {
        const outcome = await this.autoAssign.run(campaign.id);
        if (outcome.assigned.length > 0) {
          assigned.set(campaign.id, outcome.assigned);
          this.logger.log(`campaign ${campaign.id}: preferences given to ${outcome.assigned.length} more students (Q6 sweep)`);
        }
        await this.lowPreferenceAlert.afterAutoAssign(campaign.id, outcome);
      } catch (error) {
        // One broken campaign must not stop the others.
        this.logger.error(`campaign ${campaign.id}: Q6 sweep failed: ${errorMessage(error)}`);
      }
    }
    return assigned;
  }
}
