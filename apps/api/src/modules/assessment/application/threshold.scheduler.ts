import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { type CampaignStatus, toHundredths } from '@srm/shared';
import type { Pool } from 'pg';
import { Clock } from '../../../common/clock/index.js';
import { loadEnv } from '../../../common/config/env.js';
import { errorMessage, RowVersionConflictError } from '../../../common/errors/index.js';
import { ADVISORY_LOCK_KEYS, withAdvisoryLock } from '../../../common/scheduling/advisory-lock.js';
import { DRIZZLE, PG_POOL } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { type CampaignSettings, CampaignService } from '../../campaign/index.js';
import { type GradingPreference, PreferenceGradingService } from '../../matching/index.js';
import { ExamGradingRepository, type PublishedSessionRow } from '../infrastructure/exam-grading.repository.js';
import { THRESHOLD_HOLDS, type ThresholdHolds } from './threshold-holds.js';

const HOUR_MS = 60 * 60_000;

/** Phases in which a graded preference may still wait for its appeal window to pass. */
const THRESHOLD_PHASES: readonly CampaignStatus[] = ['TESTING', 'ALLOCATION_REVIEW', 'SUPPLEMENTARY'];

export interface ThresholdSweepReport {
  /** False when another instance held the advisory lock; nothing was done. */
  acquired: boolean;
  /** Preferences this run moved to BELOW_THRESHOLD. */
  below: number[];
}

const pairKey = (studentId: number, jdId: number) => `${studentId}:${jdId}`;

/**
 * The threshold sweep, every 10 minutes (BR-07, US-4.4 AC-14, CONTEXT D53): once a session's
 * results have been published for `appeal_window_hours` (by `Clock`), its preference still
 * TEST_GRADED with S_test below θ_test moves to BELOW_THRESHOLD, a final state. Earlier the
 * student may still appeal (US-4.6), which THRESHOLD_HOLDS can hold back. Scores compare as whole
 * hundredths (AGENTS › Invariant 9). Each preference in its own transaction, under its row lock;
 * one that fails is tried again next run. Under an advisory lock; off when SCHEDULER_ENABLED is
 * false (tests call `runOnce()`).
 */
@Injectable()
export class ThresholdScheduler {
  private readonly logger = new Logger(ThresholdScheduler.name);
  private readonly enabled = loadEnv().SCHEDULER_ENABLED;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly clock: Clock,
    private readonly grading: ExamGradingRepository,
    private readonly preferences: PreferenceGradingService,
    private readonly campaigns: CampaignService,
    @Inject(THRESHOLD_HOLDS) private readonly holds: ThresholdHolds,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'grading-threshold', waitForCompletion: true })
  async tick(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(`threshold sweep failed: ${errorMessage(error)}`);
    }
  }

  async runOnce(): Promise<ThresholdSweepReport> {
    const run = await withAdvisoryLock(this.pool, ADVISORY_LOCK_KEYS.GRADING_THRESHOLD, async () => {
      const below: number[] = [];
      for (const status of THRESHOLD_PHASES) {
        for (const campaign of await this.campaigns.listSettingsInPhase(status)) {
          try {
            below.push(...(await this.sweepCampaign(campaign)));
          } catch (error) {
            this.logger.error(`campaign ${campaign.id}: threshold not applied: ${errorMessage(error)}`);
          }
        }
      }
      return below;
    });
    return run.acquired ? { acquired: true, below: run.result } : { acquired: false, below: [] };
  }

  private async sweepCampaign(campaign: CampaignSettings): Promise<number[]> {
    const cutoff = new Date(this.clock.now().getTime() - campaign.config.appeal_window_hours * HOUR_MS);
    const thetaX100 = toHundredths(campaign.config.theta_test);
    const failing = (await this.grading.listPublishedBefore(campaign.id, cutoff)).filter(
      (session) => toHundredths(session.sTest) < thetaX100,
    );
    if (failing.length === 0) return [];
    const graded = new Map(
      (await this.preferences.listTestGraded(campaign.id)).map((preference) => [
        pairKey(preference.studentId, preference.jdId),
        preference,
      ]),
    );
    const due = failing.filter((session) => graded.has(pairKey(session.studentId, session.jdId)));
    if (due.length === 0) return [];
    const held = await this.holds.heldSessionIds(due.map((session) => session.sessionId));
    const below: number[] = [];
    for (const session of due) {
      if (held.has(session.sessionId)) continue;
      const preference = graded.get(pairKey(session.studentId, session.jdId))!;
      try {
        if (await this.moveBelow(session, preference)) below.push(preference.id);
      } catch (error) {
        if (error instanceof RowVersionConflictError) {
          this.logger.log(`preference ${preference.id}: changed since listed; the next sweep sees it again`);
          continue;
        }
        this.logger.error(`preference ${preference.id}: not moved BELOW_THRESHOLD: ${errorMessage(error)}`);
      }
    }
    return below;
  }

  /** False when the preference left TEST_GRADED since it was listed. */
  private async moveBelow(session: PublishedSessionRow, listed: GradingPreference): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const locked = await this.preferences.lockForGrading(session.studentId, session.jdId, { tx });
      if (locked?.status !== 'TEST_GRADED') return false;
      await this.preferences.markBelowThreshold(locked.id, listed.rowVersion, { tx });
      return true;
    });
  }
}
