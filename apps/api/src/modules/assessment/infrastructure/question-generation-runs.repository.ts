import { Inject, Injectable } from '@nestjs/common';
import type { MissingCell, QuestionGenerationRunStatus } from '@srm/shared';
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { questionGenerationRuns } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import type { Actor } from '../../audit/index.js';

export type QuestionGenerationRunRecord = typeof questionGenerationRuns.$inferSelect;

/** How the result of a job closes its run (US-4.1 AC-9). */
export interface QuestionRunEnd {
  status: Exclude<QuestionGenerationRunStatus, 'RUNNING'>;
  missingCells: MissingCell[] | null;
  /** Required for FAILED. */
  errorCode: string | null;
}

/** Drizzle access to `core.question_generation_runs`, owned by the assessment module. */
@Injectable()
export class QuestionGenerationRunsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Closes the bank's RUNNING run as FAILED `STALE` when its result can no longer be expected:
   * started before `olderThan`, or never handed to the broker after `undispatchedBefore` (the API
   * stopped between commit and dispatch). Otherwise a lost result would block the bank.
   */
  async closeStale(tx: DbTx, bankId: number, olderThan: Date, undispatchedBefore: Date): Promise<void> {
    await tx
      .update(questionGenerationRuns)
      .set({ status: 'FAILED', errorCode: 'STALE', finishedAt: sql`now()` })
      .where(
        and(
          eq(questionGenerationRuns.bankId, bankId),
          eq(questionGenerationRuns.status, 'RUNNING'),
          or(
            lt(questionGenerationRuns.createdAt, olderThan),
            and(isNull(questionGenerationRuns.dispatchedAt), lt(questionGenerationRuns.createdAt, undispatchedBefore)),
          ),
        ),
      );
  }

  /** Whether the bank ever had a run, of any status. */
  async exists(tx: DbTx, bankId: number): Promise<boolean> {
    const [row] = await tx
      .select({ id: questionGenerationRuns.id })
      .from(questionGenerationRuns)
      .where(eq(questionGenerationRuns.bankId, bankId))
      .limit(1);
    return row !== undefined;
  }

  async findRunning(tx: DbTx, bankId: number): Promise<QuestionGenerationRunRecord | undefined> {
    const [row] = await tx
      .select()
      .from(questionGenerationRuns)
      .where(and(eq(questionGenerationRuns.bankId, bankId), eq(questionGenerationRuns.status, 'RUNNING')));
    return row;
  }

  /** The job id is stored with the run, before the job is sent (LESSONS §33). */
  async insertRunning(tx: DbTx, bankId: number, jobId: string, actor: Actor): Promise<QuestionGenerationRunRecord> {
    const [row] = await tx
      .insert(questionGenerationRuns)
      .values({
        bankId,
        jobId,
        status: 'RUNNING',
        actorKind: actor.kind,
        actorId: actor.kind === 'USER' ? actor.userId : null,
      })
      .returning();
    if (!row) throw new Error('insert into question_generation_runs returned no row');
    return row;
  }

  async markDispatched(runId: number): Promise<void> {
    await this.db
      .update(questionGenerationRuns)
      .set({ dispatchedAt: sql`now()` })
      .where(eq(questionGenerationRuns.id, runId));
  }

  /** Ends a run that is still RUNNING; a run already closed is left as it is. */
  async fail(runId: number, errorCode: string): Promise<void> {
    await this.db
      .update(questionGenerationRuns)
      .set({ status: 'FAILED', errorCode, finishedAt: sql`now()` })
      .where(and(eq(questionGenerationRuns.id, runId), eq(questionGenerationRuns.status, 'RUNNING')));
  }

  /** The newest run of the bank, which the blueprint view shows. */
  async latest(bankId: number): Promise<QuestionGenerationRunRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(questionGenerationRuns)
      .where(eq(questionGenerationRuns.bankId, bankId))
      .orderBy(desc(questionGenerationRuns.id))
      .limit(1);
    return row;
  }

  async findByJob(tx: DbTx, jobId: string): Promise<QuestionGenerationRunRecord | undefined> {
    const [row] = await tx.select().from(questionGenerationRuns).where(eq(questionGenerationRuns.jobId, jobId));
    return row;
  }

  /**
   * The result of the job: counts the drafts it added, and closes the run while it is RUNNING. A
   * run already closed (a duplicate, or STALE before the result came) keeps its status; late
   * drafts are still counted.
   */
  async finishJob(tx: DbTx, jobId: string, received: number, end: QuestionRunEnd): Promise<void> {
    if (received > 0) {
      await tx
        .update(questionGenerationRuns)
        .set({ questionsReceived: sql`${questionGenerationRuns.questionsReceived} + ${received}` })
        .where(eq(questionGenerationRuns.jobId, jobId));
    }
    await tx
      .update(questionGenerationRuns)
      .set({ ...end, finishedAt: sql`now()` })
      .where(and(eq(questionGenerationRuns.jobId, jobId), eq(questionGenerationRuns.status, 'RUNNING')));
  }
}
