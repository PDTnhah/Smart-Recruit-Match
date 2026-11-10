import { Inject, Injectable } from '@nestjs/common';
import type { EssayGradingRunStatus } from '@srm/shared';
import { and, asc, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { essayGradingRuns } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import type { Actor } from '../../audit/index.js';

export type EssayGradingRunRecord = typeof essayGradingRuns.$inferSelect;

export interface NewEssayGradingRun {
  campaignId: number;
  jobId: string;
  actor: Actor;
  sessionCount: number;
}

/** Drizzle access to `core.essay_grading_runs` (US-4.4 AC-2, CONTEXT D53), owned by the assessment module. */
@Injectable()
export class EssayGradingRunsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** The job id is stored with the run, before the job is sent (LESSONS §33). */
  async insertRunning(tx: DbTx, values: NewEssayGradingRun): Promise<EssayGradingRunRecord> {
    const { actor, ...rest } = values;
    const [row] = await tx
      .insert(essayGradingRuns)
      .values({ ...rest, status: 'RUNNING', actorKind: actor.kind, actorId: actor.kind === 'USER' ? actor.userId : null })
      .returning();
    if (!row) throw new Error('insert into essay_grading_runs returned no row');
    return row;
  }

  async markDispatched(runId: number): Promise<void> {
    await this.db.update(essayGradingRuns).set({ dispatchedAt: sql`now()` }).where(eq(essayGradingRuns.id, runId));
  }

  /** The run of a job, locked: the messages of one job are applied one after the other. */
  async lockByJob(tx: DbTx, jobId: string): Promise<EssayGradingRunRecord | undefined> {
    const [row] = await tx.select().from(essayGradingRuns).where(eq(essayGradingRuns.jobId, jobId)).for('update');
    return row;
  }

  async lock(tx: DbTx, runId: number): Promise<EssayGradingRunRecord | undefined> {
    const [row] = await tx.select().from(essayGradingRuns).where(eq(essayGradingRuns.id, runId)).for('update');
    return row;
  }

  /**
   * The prompt the campaign's essays are graded with (CONTEXT D46, D53): that of its oldest run
   * with a result; null before the first one, when the AI Service takes the active prompt.
   */
  async pinnedPrompt(tx: DbTx | Database, campaignId: number): Promise<string | null> {
    const [row] = await tx
      .select({ promptVersion: essayGradingRuns.promptVersion })
      .from(essayGradingRuns)
      .where(and(eq(essayGradingRuns.campaignId, campaignId), isNotNull(essayGradingRuns.promptVersion)))
      .orderBy(asc(essayGradingRuns.id))
      .limit(1);
    return row?.promptVersion ?? null;
  }

  /** The prompt of the job's grades, from its first result. */
  async setPromptVersion(tx: DbTx, runId: number, promptVersion: string): Promise<void> {
    await tx
      .update(essayGradingRuns)
      .set({ promptVersion })
      .where(and(eq(essayGradingRuns.id, runId), isNull(essayGradingRuns.promptVersion)));
  }

  /** Ends a run that is still RUNNING; a run already closed keeps its status. */
  async finish(
    tx: DbTx,
    runId: number,
    status: Exclude<EssayGradingRunStatus, 'RUNNING'>,
    errorCode: string | null,
  ): Promise<void> {
    await tx
      .update(essayGradingRuns)
      .set({ status, errorCode, finishedAt: sql`now()` })
      .where(and(eq(essayGradingRuns.id, runId), eq(essayGradingRuns.status, 'RUNNING')));
  }

  /** RUNNING runs never handed to the broker, created before `before` (the API stopped in between). */
  async listUndispatched(before: Date): Promise<EssayGradingRunRecord[]> {
    return this.db
      .select()
      .from(essayGradingRuns)
      .where(
        and(
          eq(essayGradingRuns.status, 'RUNNING'),
          isNull(essayGradingRuns.dispatchedAt),
          lt(essayGradingRuns.createdAt, before),
        ),
      )
      .orderBy(asc(essayGradingRuns.id));
  }

  /** RUNNING runs created before `before`: no result can be expected any more. */
  async listRunningBefore(before: Date): Promise<EssayGradingRunRecord[]> {
    return this.db
      .select()
      .from(essayGradingRuns)
      .where(and(eq(essayGradingRuns.status, 'RUNNING'), lt(essayGradingRuns.createdAt, before)))
      .orderBy(asc(essayGradingRuns.id));
  }
}
