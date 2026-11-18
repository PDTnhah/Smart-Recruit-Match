import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CAMPAIGN_FINAL_STATES } from '@srm/shared';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { Clock } from '../../../common/clock/index.js';
import { loadEnv } from '../../../common/config/env.js';
import { errorMessage } from '../../../common/errors/index.js';
import { ADVISORY_LOCK_KEYS, withAdvisoryLock } from '../../../common/scheduling/advisory-lock.js';
import { DRIZZLE, PG_POOL } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { AiGatewayService } from '../../aigateway/index.js';
import { CampaignService, type CampaignSettings } from '../../campaign/index.js';
import { PreferenceExamService } from '../../matching/index.js';
import { CvService } from '../../student/index.js';
import { type CvVerificationRecord, CvVerificationsRepository } from '../infrastructure/cv-verifications.repository.js';
import { ExamSessionsRepository } from '../infrastructure/exam-sessions.repository.js';
import { QuestionBanksRepository } from '../infrastructure/question-banks.repository.js';

/**
 * A job still RUNNING after this long is closed FAILED with STALE (CONTEXT D57). Long enough for
 * the first sweep of a large campaign, which sends one drafting job per preference at once.
 */
export const CV_VERIFICATION_STALE_AFTER_MS = 6 * 60 * 60_000;

/** Checking jobs started per run. */
const EVALUATION_BATCH = 500;

export interface CvVerificationSweepReport {
  /** False when another instance held the advisory lock; nothing was done. */
  acquired: boolean;
  /** Rows closed STALE: drafting, then checking. */
  stale: { drafts: number[]; evaluations: number[] };
  /** Rows this run created for a drafting job. */
  drafted: number[];
  /** Rows whose drafting job this run handed to the broker, new ones and ones left by an earlier run. */
  dispatched: number[];
  /** Rows whose checking job this run handed to the broker. */
  evaluations: number[];
}

/**
 * The sweep of part D, every minute (FR-25, US-4.8 AC-2, AC-5, ARCHITECTURE › Tác vụ định kỳ,
 * CONTEXT D57). Work tied to a phase runs here, never in a phase-change listener (LESSONS §34):
 *
 * 1. closes STALE the jobs still RUNNING after 6 hours; they are not sent again;
 * 2. for each campaign in TESTING with the phase still open, every PENDING_TEST preference of a JD
 *    whose locked bank has part D on, without a session or a row yet, gets a RUNNING row with its
 *    job id, committed before the job is sent (LESSONS §33); preferences no longer change in
 *    TESTING, so the row's preference id holds;
 * 3. sends every drafting job not handed to the broker yet, of those campaigns only: once TESTING
 *    closed, or the campaign was cancelled, no session can take the questions;
 * 4. starts the check of each READY part D whose session closed, outside closed and cancelled
 *    campaigns, and sends it the same way.
 *
 * A failed dispatch is logged and left for the next run (LESSONS §44). Under an advisory lock;
 * off when SCHEDULER_ENABLED is false (tests call `runOnce()`).
 */
@Injectable()
export class CvVerificationScheduler {
  private readonly logger = new Logger(CvVerificationScheduler.name);
  private readonly enabled = loadEnv().SCHEDULER_ENABLED;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly clock: Clock,
    private readonly campaigns: CampaignService,
    private readonly preferences: PreferenceExamService,
    private readonly cvs: CvService,
    private readonly banks: QuestionBanksRepository,
    private readonly sessions: ExamSessionsRepository,
    private readonly verifications: CvVerificationsRepository,
    private readonly aiGateway: AiGatewayService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'cv-verification-sweep', waitForCompletion: true })
  async tick(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(`cv verification sweep failed: ${errorMessage(error)}`);
    }
  }

  async runOnce(): Promise<CvVerificationSweepReport> {
    const run = await withAdvisoryLock(this.pool, ADVISORY_LOCK_KEYS.CV_VERIFICATION_SWEEP, async () => {
      const now = this.clock.now().getTime();
      const stale = await this.closeStale(new Date(now - CV_VERIFICATION_STALE_AFTER_MS));
      const drafted: number[] = [];
      const testing = (await this.campaigns.listSettingsInPhase('TESTING')).filter((campaign) =>
        this.campaigns.isPhaseOpen(campaign, ['TESTING']),
      );
      for (const campaign of testing) {
        try {
          drafted.push(...(await this.draftFor(campaign)));
        } catch (error) {
          this.logger.error(`campaign ${campaign.id}: part D not drafted: ${errorMessage(error)}`);
        }
      }
      const dispatched = await this.sendDrafts(testing.map((campaign) => campaign.id));
      const evaluations = await this.startEvaluations();
      return { stale, drafted, dispatched, evaluations };
    });
    if (run.acquired) return { acquired: true, ...run.result };
    return { acquired: false, stale: { drafts: [], evaluations: [] }, drafted: [], dispatched: [], evaluations: [] };
  }

  private async closeStale(before: Date): Promise<CvVerificationSweepReport['stale']> {
    try {
      const stale = await this.verifications.closeStale(before);
      const count = stale.drafts.length + stale.evaluations.length;
      if (count > 0) this.logger.warn(`part D: ${count} jobs gave no result in time, closed STALE`);
      return stale;
    } catch (error) {
      this.logger.error(`part D: stale jobs not closed: ${errorMessage(error)}`);
      return { drafts: [], evaluations: [] };
    }
  }

  /**
   * Step 2 for one campaign: the rows created, in one transaction. Preferences with a row are
   * dropped first, so once every one has its row a run reads no session or CV.
   */
  private async draftFor(campaign: CampaignSettings): Promise<number[]> {
    const pending = await this.preferences.listPendingTest(campaign.id);
    if (pending.length === 0) return [];
    const banks = await this.banks.findByJds([...new Set(pending.map((preference) => preference.jdId))]);
    const countOf = new Map(
      banks
        .filter((bank) => bank.status === 'LOCKED' && bank.cvVerificationEnabled)
        .map((bank) => [bank.jdId, bank.cvVerificationCount]),
    );
    const partD = pending.filter((preference) => countOf.has(preference.jdId));
    if (partD.length === 0) return [];
    const withRow = await this.verifications.preferencesWithRow(partD.map((preference) => preference.id));
    const due = partD.filter((preference) => !withRow.has(preference.id));
    if (due.length === 0) return [];
    const [taken, cvs] = await Promise.all([
      this.sessions.listSessionPairs(
        due.map((preference) => preference.studentId),
        [...new Set(due.map((preference) => preference.jdId))],
      ),
      this.cvs.listConfirmedKeys(campaign.id),
    ]);
    const started = new Set(taken.map((pair) => `${pair.studentId}:${pair.jdId}`));
    const cvOf = new Map(cvs.map((cv) => [cv.studentId, cv]));
    const todo = due
      .filter((preference) => !started.has(`${preference.studentId}:${preference.jdId}`))
      .flatMap((preference) => {
        const cv = cvOf.get(preference.studentId);
        const questionCount = countOf.get(preference.jdId);
        return cv && questionCount !== undefined ? [{ preference, cv, questionCount }] : [];
      })
      // NV1 first: the sooner a student is likely to start, the sooner its questions are drafted.
      .sort((a, b) => a.preference.rank - b.preference.rank || a.preference.id - b.preference.id);
    if (todo.length === 0) return [];
    return this.db.transaction((tx) =>
      this.verifications.insertRunning(
        tx,
        todo.map(({ preference, cv, questionCount }) => ({
          preferenceId: preference.id,
          cvId: cv.cvId,
          cvVersion: cv.cvVersion,
          jdId: preference.jdId,
          questionCount,
          jobId: randomUUID(),
        })),
      ),
    );
  }

  /**
   * Step 3: whether each job reached the broker is recorded; one that did not is sent next run,
   * while its campaign is still in an open TESTING. Rows left behind are closed STALE (step 1).
   */
  private async sendDrafts(campaignIds: readonly number[]): Promise<number[]> {
    const sent: number[] = [];
    let rows: CvVerificationRecord[];
    try {
      rows = await this.verifications.listUndispatched(campaignIds);
    } catch (error) {
      this.logger.error(`part D: drafting jobs not listed: ${errorMessage(error)}`);
      return sent;
    }
    for (const row of rows) {
      try {
        await this.aiGateway.dispatch(
          'CV_VERIFY_GENERATE',
          {
            preference_id: row.preferenceId,
            cv_id: row.cvId,
            cv_version: row.cvVersion,
            jd_id: row.jdId,
            question_count: row.questionCount,
          },
          row.jobId,
        );
      } catch (error) {
        this.logger.error(`part D ${row.id}: drafting job ${row.jobId} not dispatched: ${errorMessage(error)}`);
        continue;
      }
      sent.push(row.id);
      await this.verifications.markDispatched(row.id).catch((error: unknown) => {
        this.logger.warn(`part D ${row.id}: dispatched_at not written: ${errorMessage(error)}`);
      });
    }
    return sent;
  }

  /**
   * Step 4: the check of each closed session's part D, its job id committed first. Closed and
   * cancelled campaigns are left out, as every sweep does; a row that fails does not hold back the
   * others.
   */
  private async startEvaluations(): Promise<number[]> {
    const sent: number[] = [];
    let due: CvVerificationRecord[] = [];
    try {
      const final = await Promise.all(CAMPAIGN_FINAL_STATES.map((status) => this.campaigns.listSettingsInPhase(status)));
      due = await this.verifications.listDueForEvaluation(
        EVALUATION_BATCH,
        final.flat().map((campaign) => campaign.id),
      );
    } catch (error) {
      this.logger.error(`part D: checks not listed: ${errorMessage(error)}`);
    }
    for (const row of due) {
      try {
        await this.db.transaction((tx) => this.verifications.startEvaluation(tx, row.id, randomUUID()));
      } catch (error) {
        this.logger.error(`part D ${row.id}: check not started: ${errorMessage(error)}`);
      }
    }
    let rows: CvVerificationRecord[];
    try {
      rows = await this.verifications.listEvaluationUndispatched();
    } catch (error) {
      this.logger.error(`part D: checking jobs not listed: ${errorMessage(error)}`);
      return sent;
    }
    for (const row of rows) {
      if (row.evaluationJobId === null) continue;
      try {
        await this.aiGateway.dispatch(
          'CV_VERIFY_EVALUATE',
          { preference_id: row.preferenceId, cv_id: row.cvId, cv_version: row.cvVersion },
          row.evaluationJobId,
        );
      } catch (error) {
        this.logger.error(`part D ${row.id}: checking job ${row.evaluationJobId} not dispatched: ${errorMessage(error)}`);
        continue;
      }
      sent.push(row.id);
      await this.verifications.markEvaluationDispatched(row.id).catch((error: unknown) => {
        this.logger.warn(`part D ${row.id}: evaluation_dispatched_at not written: ${errorMessage(error)}`);
      });
    }
    return sent;
  }
}
