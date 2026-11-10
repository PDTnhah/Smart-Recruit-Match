import { Inject, Injectable, Logger } from '@nestjs/common';
import { ESSAY_GRADE_MAX_SESSIONS, type EssayGradingDispatch } from '@srm/shared';
import { randomUUID } from 'node:crypto';
import { errorMessage } from '../../../common/errors/index.js';
import { ADVISORY_LOCK_KEYS, lockEntityInTx } from '../../../common/scheduling/advisory-lock.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { AiGatewayService } from '../../aigateway/index.js';
import { type Actor, AuditService } from '../../audit/index.js';
import { ASSESSMENT_AUDIT_ACTIONS, ESSAY_GRADING_RUN_ENTITY } from '../domain/audit-actions.js';
import { passKeyOf, withPass } from '../domain/essay-pass.js';
import { type EssayGradingRunRecord, EssayGradingRunsRepository } from '../infrastructure/essay-grading-runs.repository.js';
import { ExamGradingRepository } from '../infrastructure/exam-grading.repository.js';

/** Error code of a run closed STALE: no result came in time (ARCHITECTURE › Tác vụ định kỳ). */
export const STALE_RUN_CODE = 'NO_RESULT';

interface PlannedRun {
  run: EssayGradingRunRecord;
  sessionIds: number[];
}

/**
 * Sends the essays of a campaign to the Grader (US-4.4 AC-2, CONTEXT D53): the grading sweep once
 * the campaign is past `testing_end` with no session open, or CENTER's "Chấm tự luận" earlier.
 * Under the campaign's transaction lock, closed sessions never sent go to new runs of at most
 * ESSAY_GRADE_MAX_SESSIONS each, their job ids stored with the runs and the sessions pointing at
 * them; the jobs are sent after the commit (LESSONS §33). A session is sent once: a second call
 * finds nothing new. The job is pinned to the campaign's prompt (CONTEXT D46). Sessions with no
 * essay for the Grader are left to the grading sweep, which publishes after `testing_end`.
 */
@Injectable()
export class EssayGradingService {
  private readonly logger = new Logger(EssayGradingService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly runs: EssayGradingRunsRepository,
    private readonly grading: ExamGradingRepository,
    private readonly aiGateway: AiGatewayService,
    private readonly audit: AuditService,
  ) {}

  async dispatchForCampaign(campaignId: number, actor: Actor): Promise<EssayGradingDispatch> {
    const { planned, promptVersion } = await this.db.transaction(async (tx) => {
      await lockEntityInTx(tx, ADVISORY_LOCK_KEYS.ESSAY_GRADING, campaignId);
      const pinned = await this.runs.pinnedPrompt(tx, campaignId);
      const runs: PlannedRun[] = [];
      for (;;) {
        const sessionIds = await this.grading.listDispatchable(tx, campaignId, ESSAY_GRADE_MAX_SESSIONS);
        if (sessionIds.length === 0) break;
        const run = await this.runs.insertRunning(tx, {
          campaignId,
          jobId: randomUUID(),
          actor,
          sessionCount: sessionIds.length,
        });
        await this.grading.assignRun(tx, sessionIds, run.id);
        await this.audit.record(tx, {
          actor,
          action: ASSESSMENT_AUDIT_ACTIONS.ESSAY_GRADING_DISPATCHED,
          entity: ESSAY_GRADING_RUN_ENTITY,
          entityId: run.id,
          after: { campaignId, jobId: run.jobId, sessionCount: sessionIds.length },
        });
        runs.push({ run, sessionIds });
        if (sessionIds.length < ESSAY_GRADE_MAX_SESSIONS) break;
      }
      return { planned: runs, promptVersion: pinned };
    });

    const runs: EssayGradingDispatch['runs'] = [];
    for (const { run, sessionIds } of planned) {
      runs.push({ runId: run.id, sessionCount: sessionIds.length, sent: await this.send(run, sessionIds, promptVersion) });
    }
    return { runs };
  }

  /**
   * Sends again the runs the API never handed to the broker (it stopped between the commit and the
   * dispatch), with the same job id: the AI Service grades each job once (AD-5).
   */
  async redispatchUndispatched(before: Date): Promise<number[]> {
    const sent: number[] = [];
    for (const run of await this.runs.listUndispatched(before)) {
      const sessionIds = await this.grading.sessionIdsOfRun(run.id);
      if (sessionIds.length === 0) continue;
      if (await this.send(run, sessionIds, await this.runs.pinnedPrompt(this.db, run.campaignId))) sent.push(run.id);
    }
    return sent;
  }

  /**
   * Closes STALE every run still RUNNING that was created before `before` (CONTEXT D53: 7 days);
   * its passes still missing become failures, so those essays go to a human grader. Returns the
   * sessions touched, for `finalizeIfReady`.
   */
  async closeStaleRuns(before: Date): Promise<number[]> {
    const touched = new Set<number>();
    for (const listed of await this.runs.listRunningBefore(before)) {
      const sessions = await this.db.transaction(async (tx) => {
        const run = await this.runs.lock(tx, listed.id);
        if (run?.status !== 'RUNNING') return [];
        const failed = await this.failIncompletePasses(tx, run.id, STALE_RUN_CODE);
        await this.runs.finish(tx, run.id, 'STALE', STALE_RUN_CODE);
        return failed;
      });
      this.logger.warn(`essay grading run ${listed.id}: no result in time, closed STALE`);
      for (const sessionId of sessions) touched.add(sessionId);
    }
    return [...touched];
  }

  /**
   * CONTEXT D53: every pass still missing for the run's essays without a final score becomes a
   * failure with `code` (a job that failed whole, or a stale run). Under the run's row lock, in
   * `tx`; returns the sessions touched.
   */
  async failIncompletePasses(tx: DbTx, runId: number, code: string): Promise<number[]> {
    const touched = new Set<number>();
    for (const answer of await this.grading.lockIncompleteOfRun(tx, runId)) {
      let grading = answer.aiGrading;
      for (const passNo of [1, 2]) {
        const failure = { code, needs_review: false, prompt_version: null };
        grading = withPass(grading, passKeyOf(passNo), { kind: 'FAILURE', failure }) ?? grading;
      }
      if (grading === null || grading === answer.aiGrading) continue;
      await this.grading.writeAiGrading(tx, answer.sessionId, answer.questionId, grading);
      touched.add(answer.sessionId);
    }
    return [...touched];
  }

  /** Whether the broker took the job. A failure leaves the run undispatched for the sweep. */
  private async send(run: EssayGradingRunRecord, sessionIds: number[], promptVersion: string | null): Promise<boolean> {
    try {
      await this.aiGateway.dispatch('ESSAY_GRADE', { exam_session_ids: sessionIds, prompt_version: promptVersion }, run.jobId);
    } catch (error) {
      this.logger.error(`essay grading run ${run.id}: job ${run.jobId} not dispatched: ${errorMessage(error)}`);
      return false;
    }
    await this.runs.markDispatched(run.id).catch((error: unknown) => {
      this.logger.warn(`essay grading run ${run.id}: dispatched_at not written: ${errorMessage(error)}`);
    });
    return true;
  }
}
