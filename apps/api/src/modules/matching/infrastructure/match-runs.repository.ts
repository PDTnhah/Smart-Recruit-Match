import { Inject, Injectable } from '@nestjs/common';
import type { MatchRunStatus } from '@srm/shared';
import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { MatchingRunInProgressError } from '../../../common/errors/index.js';
import { uniqueViolation } from '../../../db/errors.js';
import { matchRuns } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import type { Actor } from '../../audit/index.js';

export interface MatchRunCounts {
  pairsTotal: number;
  pairsIneligible: number;
  pairsSkipped: number;
  pairsCached: number;
  pairsSent: number;
}

export type MatchRunRecord = typeof matchRuns.$inferSelect;

/** How the last result of a job closes its run (US-3.2 AC-9, AC-10). */
export interface MatchRunEnd {
  status: Exclude<MatchRunStatus, 'RUNNING'>;
  pairsFailed: number;
  /** Required for FAILED. */
  errorCode: string | null;
}

/** Drizzle access to `core.match_runs`, owned by the matching module (AGENTS › Invariant 13). */
@Injectable()
export class MatchRunsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Closes the campaign's RUNNING run as FAILED `STALE` when its result can no longer be expected:
   * started before `olderThan`, or with a job never handed to the broker after `undispatchedBefore`
   * (the API stopped between commit and dispatch). Otherwise a lost result would block the campaign.
   */
  async closeStale(tx: DbTx, campaignId: number, olderThan: Date, undispatchedBefore: Date): Promise<void> {
    await tx
      .update(matchRuns)
      .set({ status: 'FAILED', errorCode: 'STALE', finishedAt: sql`now()` })
      .where(
        and(
          eq(matchRuns.campaignId, campaignId),
          eq(matchRuns.status, 'RUNNING'),
          or(
            lt(matchRuns.createdAt, olderThan),
            and(isNull(matchRuns.dispatchedAt), gt(matchRuns.pairsSent, 0), lt(matchRuns.createdAt, undispatchedBefore)),
          ),
        ),
      );
  }

  /** AC-13: a second RUNNING run of the campaign hits the partial unique index: 409. */
  async insertRunning(tx: DbTx, campaignId: number, actor: Actor, rulesVersion: string): Promise<number> {
    try {
      // The caller's transaction rolls back on the violation; nothing else of the run is written yet.
      const [row] = await tx
        .insert(matchRuns)
        .values({
          campaignId,
          status: 'RUNNING',
          actorKind: actor.kind,
          actorId: actor.kind === 'USER' ? actor.userId : null,
          rulesVersion,
          pairsTotal: 0,
          pairsIneligible: 0,
          pairsSkipped: 0,
          pairsCached: 0,
          pairsSent: 0,
        })
        .returning({ id: matchRuns.id });
      if (!row) throw new Error('insert into match_runs returned no row');
      return row.id;
    } catch (error) {
      if (uniqueViolation(error) === 'match_runs_campaign_running_key') throw new MatchingRunInProgressError(campaignId);
      throw error;
    }
  }

  /**
   * What the run stored and sends, and the id of the job that will send it (CHECK
   * match_runs_job_check); a run with nothing to send is over at once.
   */
  async recordPlan(
    tx: DbTx,
    runId: number,
    counts: MatchRunCounts,
    promptVersion: string | null,
    jobId: string | null,
  ): Promise<MatchRunRecord> {
    const done = counts.pairsSent === 0;
    const [row] = await tx
      .update(matchRuns)
      .set({
        ...counts,
        promptVersion,
        jobId,
        ...(done ? { status: 'SUCCEEDED' as const, finishedAt: sql`now()` } : {}),
      })
      .where(eq(matchRuns.id, runId))
      .returning();
    if (!row) throw new Error(`match run ${runId} vanished`);
    return row;
  }

  async markDispatched(runId: number): Promise<void> {
    await this.db.update(matchRuns).set({ dispatchedAt: sql`now()` }).where(eq(matchRuns.id, runId));
  }

  /** Counts the pairs one result message of the job scored; a closed run still counts late ones. */
  async addScored(tx: DbTx, jobId: string, scored: number): Promise<void> {
    if (scored === 0) return;
    await tx
      .update(matchRuns)
      .set({ pairsScored: sql`${matchRuns.pairsScored} + ${scored}` })
      .where(eq(matchRuns.jobId, jobId));
  }

  /**
   * The last result of the job closes its run. A run already closed (a duplicate, or STALE before
   * the result came) is left as it is.
   */
  async finishJob(tx: DbTx, jobId: string, end: MatchRunEnd): Promise<void> {
    await tx
      .update(matchRuns)
      .set({ ...end, finishedAt: sql`now()` })
      .where(and(eq(matchRuns.jobId, jobId), eq(matchRuns.status, 'RUNNING')));
  }

  /** Ends a run that is still RUNNING; a run already closed is left as it is. */
  async fail(runId: number, errorCode: string): Promise<void> {
    await this.db
      .update(matchRuns)
      .set({ status: 'FAILED', errorCode, finishedAt: sql`now()` })
      .where(and(eq(matchRuns.id, runId), eq(matchRuns.status, 'RUNNING')));
  }
}
