import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { CampaignStatus } from '@srm/shared';
import type { Pool } from 'pg';
import { Clock } from '../../../common/clock/index.js';
import { loadEnv } from '../../../common/config/env.js';
import { errorMessage } from '../../../common/errors/index.js';
import { ADVISORY_LOCK_KEYS, withAdvisoryLock } from '../../../common/scheduling/advisory-lock.js';
import { PG_POOL } from '../../../db/tokens.js';
import { SYSTEM_ACTOR } from '../../audit/index.js';
import { CampaignService } from '../../campaign/index.js';
import { ExamGradingRepository } from '../infrastructure/exam-grading.repository.js';
import { EssayGradingService } from './essay-grading.service.js';
import { GradingService, isPastTestingEnd } from './grading.service.js';

/** Sessions read per page. */
const PAGE = 200;

/**
 * A run with passes still missing after this long is closed STALE (CONTEXT D53): up to three
 * rounds of provider batches of 24–48 hours each, as matching runs (US-3.2).
 */
export const STALE_RUN_AFTER_MS = 7 * 24 * 60 * 60_000;

/** A run not handed to the broker after this long is sent again (the API stopped in between). */
export const UNDISPATCHED_RUN_AFTER_MS = 10 * 60_000;

/** Phases in which a campaign past `testing_end` may still have essays to send (CONTEXT D53). */
const GRADING_PHASES: readonly CampaignStatus[] = ['TESTING', 'ALLOCATION_REVIEW'];

export interface GradingSweepReport {
  /** False when another instance held the advisory lock; nothing was done. */
  acquired: boolean;
  /** Sessions whose missing passes a stale run failed. */
  staleSessions: number[];
  /** Runs this run created and handed to the broker. */
  dispatched: number[];
  /** Runs never handed to the broker, sent again. */
  redispatched: number[];
  /** Sessions whose results this run published. */
  published: number[];
}

/**
 * The grading sweep, every 5 minutes (US-4.4 AC-1, AC-2, AC-11, ARCHITECTURE › Tác vụ định kỳ,
 * CONTEXT D53). Each run does every step again, so a step that failed or an API that stopped is
 * caught up (LESSONS §34):
 *
 * 1. closes STALE the runs with passes still missing after 7 days, those passes failed, and offers
 *    their sessions to `finalizeIfReady` (their essays go to a human grader); sends again the runs
 *    never handed to the broker;
 * 2. sends the essays of each campaign past `testing_end` with no session open;
 * 3. offers every closed session with nothing left to wait for, outside campaigns still before
 *    `testing_end`, to `finalizeIfReady` (which also grades multiple choice left ungraded).
 *
 * Under an advisory lock, so two instances never sweep together; off when SCHEDULER_ENABLED is
 * false (tests call `runOnce()`).
 */
@Injectable()
export class GradingScheduler {
  private readonly logger = new Logger(GradingScheduler.name);
  private readonly enabled = loadEnv().SCHEDULER_ENABLED;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly clock: Clock,
    private readonly grading: ExamGradingRepository,
    private readonly essays: EssayGradingService,
    private readonly results: GradingService,
    private readonly campaigns: CampaignService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'grading-sweep', waitForCompletion: true })
  async tick(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(`grading sweep failed: ${errorMessage(error)}`);
    }
  }

  async runOnce(): Promise<GradingSweepReport> {
    const run = await withAdvisoryLock(this.pool, ADVISORY_LOCK_KEYS.GRADING_SWEEP, async () => {
      const now = this.clock.now().getTime();
      const staleSessions = await this.step('stale essay grading runs not closed', () =>
        this.essays.closeStaleRuns(new Date(now - STALE_RUN_AFTER_MS)),
      );
      const published: number[] = [];
      for (const sessionId of staleSessions) await this.offer(sessionId, published);
      const redispatched = await this.step('undispatched essay grading runs not sent again', () =>
        this.essays.redispatchUndispatched(new Date(now - UNDISPATCHED_RUN_AFTER_MS)),
      );
      const dispatched = await this.dispatchDue(now);
      published.push(...(await this.publishReady(now)));
      return { staleSessions, dispatched, redispatched, published };
    });
    if (run.acquired) return { acquired: true, ...run.result };
    return { acquired: false, staleSessions: [], dispatched: [], redispatched: [], published: [] };
  }

  /** One failing step does not stop the others. */
  private async step(failure: string, fn: () => Promise<number[]>): Promise<number[]> {
    try {
      return await fn();
    } catch (error) {
      this.logger.error(`${failure}: ${errorMessage(error)}`);
      return [];
    }
  }

  /** Step 2: one broken campaign does not stop the others. */
  private async dispatchDue(now: number): Promise<number[]> {
    const runIds: number[] = [];
    for (const status of GRADING_PHASES) {
      for (const campaign of await this.campaigns.listSettingsInPhase(status)) {
        if (!isPastTestingEnd(campaign, new Date(now))) continue;
        try {
          if (await this.grading.hasOpenSessions(campaign.id)) continue;
          const dispatch = await this.essays.dispatchForCampaign(campaign.id, SYSTEM_ACTOR);
          runIds.push(...dispatch.runs.filter((run) => run.sent).map((run) => run.runId));
        } catch (error) {
          this.logger.error(`campaign ${campaign.id}: essays not sent for grading: ${errorMessage(error)}`);
        }
      }
    }
    return runIds;
  }

  /**
   * Step 3: pages on by id, so a session that keeps failing never holds the rest back. Campaigns
   * still before `testing_end` are left out: `finalizeIfReady` would not publish them.
   */
  private async publishReady(now: number): Promise<number[]> {
    const notDue = (await this.campaigns.listSettingsInPhase('TESTING'))
      .filter((campaign) => !isPastTestingEnd(campaign, new Date(now)))
      .map((campaign) => campaign.id);
    const published: number[] = [];
    let afterId: number | undefined;
    for (;;) {
      const page = await this.grading.listReadyToPublish(PAGE, { afterId, exceptCampaignIds: notDue });
      for (const sessionId of page) await this.offer(sessionId, published);
      if (page.length < PAGE) return published;
      afterId = page.at(-1);
    }
  }

  /** `finalizeIfReady`, adding the session to `published` when it was; a failure is logged. */
  private async offer(sessionId: number, published: number[]): Promise<void> {
    try {
      if ((await this.results.finalizeIfReady(sessionId)).kind === 'PUBLISHED') published.push(sessionId);
    } catch (error) {
      this.logger.error(`exam session ${sessionId}: results not published: ${errorMessage(error)}`);
    }
  }
}
