import { Inject, Injectable } from '@nestjs/common';
import type { CvTrustLevel, CvVerificationQuestion, StoredCvEvaluation } from '@srm/shared';
import { and, asc, count, eq, inArray, isNotNull, isNull, lt, ne, notInArray, sql } from 'drizzle-orm';
import { cvVerificationQuestions, cvVerifications, examSessions, questionBanks } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';

export type CvVerificationRecord = typeof cvVerifications.$inferSelect;

export type CvVerificationQuestionRecord = typeof cvVerificationQuestions.$inferSelect;

export interface NewCvVerification {
  preferenceId: number;
  cvId: number;
  cvVersion: number;
  jdId: number;
  questionCount: number;
  jobId: string;
}

export interface FinishedEvaluation {
  status: 'DONE' | 'FAILED';
  model: string | null;
  promptVersion: string | null;
  errorCode: string | null;
  trustX100: number | null;
  trustLevel: CvTrustLevel | null;
}

/** Error code of a job that gave no result in time (ARCHITECTURE › Tác vụ định kỳ). */
export const STALE_CODE = 'STALE';

/** Rows per INSERT: far below the 65,535 bind parameters of one statement. */
const INSERT_CHUNK = 1_000;

/** Every UPDATE of a row bumps `row_version` (LESSONS §43). */
const bump = () => sql`${cvVerifications.rowVersion} + 1`;

/**
 * Drizzle access to `core.cv_verifications` and `core.cv_verification_questions` (US-4.8, CONTEXT
 * D57), owned by the assessment module.
 */
@Injectable()
export class CvVerificationsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** The preferences among these that already have part D, whatever its state. */
  async preferencesWithRow(preferenceIds: readonly number[]): Promise<Set<number>> {
    if (preferenceIds.length === 0) return new Set();
    const rows = await this.db
      .select({ preferenceId: cvVerifications.preferenceId })
      .from(cvVerifications)
      .where(inArray(cvVerifications.preferenceId, [...preferenceIds]));
    return new Set(rows.map((row) => row.preferenceId));
  }

  /**
   * The job ids are stored before the jobs are sent (LESSONS §33). Returns the ids of the rows
   * created; a preference that already has a row is skipped.
   */
  async insertRunning(tx: DbTx, values: readonly NewCvVerification[]): Promise<number[]> {
    const created: number[] = [];
    for (let start = 0; start < values.length; start += INSERT_CHUNK) {
      const rows = await tx
        .insert(cvVerifications)
        .values(values.slice(start, start + INSERT_CHUNK).map((row) => ({ ...row, status: 'RUNNING' as const })))
        .onConflictDoNothing({ target: cvVerifications.preferenceId })
        .returning({ id: cvVerifications.id });
      created.push(...rows.map((row) => row.id));
    }
    return created;
  }

  /**
   * Drafting jobs not handed to the broker yet (just written, or left by an API that stopped), of
   * these campaigns only: a job of a campaign whose TESTING closed meanwhile is never sent.
   */
  async listUndispatched(campaignIds: readonly number[]): Promise<CvVerificationRecord[]> {
    if (campaignIds.length === 0) return [];
    const rows = await this.db
      .select({ row: cvVerifications })
      .from(cvVerifications)
      .innerJoin(questionBanks, eq(questionBanks.jdId, cvVerifications.jdId))
      .where(
        and(
          eq(cvVerifications.status, 'RUNNING'),
          isNull(cvVerifications.dispatchedAt),
          inArray(questionBanks.campaignId, [...campaignIds]),
        ),
      )
      .orderBy(asc(cvVerifications.id));
    return rows.map(({ row }) => row);
  }

  async markDispatched(id: number): Promise<void> {
    await this.db
      .update(cvVerifications)
      .set({ dispatchedAt: sql`now()`, rowVersion: bump() })
      .where(eq(cvVerifications.id, id));
  }

  /** Part D of sessions now closed, not checked yet, oldest first, outside these campaigns. */
  async listDueForEvaluation(limit: number, exceptCampaignIds: readonly number[]): Promise<CvVerificationRecord[]> {
    const rows = await this.db
      .select({ row: cvVerifications })
      .from(cvVerifications)
      .innerJoin(examSessions, eq(examSessions.id, cvVerifications.sessionId))
      .innerJoin(questionBanks, eq(questionBanks.id, examSessions.bankId))
      .where(
        and(
          isNull(cvVerifications.evaluationStatus),
          ne(examSessions.status, 'IN_PROGRESS'),
          exceptCampaignIds.length > 0 ? notInArray(questionBanks.campaignId, [...exceptCampaignIds]) : undefined,
        ),
      )
      .orderBy(asc(cvVerifications.id))
      .limit(limit);
    return rows.map(({ row }) => row);
  }

  /** The checking job's id, before the job is sent; undefined when another sweep started it. */
  async startEvaluation(tx: DbTx, id: number, jobId: string): Promise<CvVerificationRecord | undefined> {
    const [row] = await tx
      .update(cvVerifications)
      .set({ evaluationStatus: 'RUNNING', evaluationJobId: jobId, evaluationRequestedAt: sql`now()`, rowVersion: bump() })
      .where(and(eq(cvVerifications.id, id), isNull(cvVerifications.evaluationStatus), isNotNull(cvVerifications.sessionId)))
      .returning();
    return row;
  }

  async listEvaluationUndispatched(): Promise<CvVerificationRecord[]> {
    return this.db
      .select()
      .from(cvVerifications)
      .where(and(eq(cvVerifications.evaluationStatus, 'RUNNING'), isNull(cvVerifications.evaluationDispatchedAt)))
      .orderBy(asc(cvVerifications.id));
  }

  async markEvaluationDispatched(id: number): Promise<void> {
    await this.db
      .update(cvVerifications)
      .set({ evaluationDispatchedAt: sql`now()`, rowVersion: bump() })
      .where(eq(cvVerifications.id, id));
  }

  /**
   * Drafting started before `before`, and checks requested before it, still RUNNING: FAILED with
   * STALE. Not sent again (CONTEXT D57). Returns the rows closed.
   */
  async closeStale(before: Date): Promise<{ drafts: number[]; evaluations: number[] }> {
    const drafts = await this.db
      .update(cvVerifications)
      .set({ status: 'FAILED', errorCode: STALE_CODE, rowVersion: bump() })
      .where(and(eq(cvVerifications.status, 'RUNNING'), lt(cvVerifications.createdAt, before)))
      .returning({ id: cvVerifications.id });
    const evaluations = await this.db
      .update(cvVerifications)
      .set({ evaluationStatus: 'FAILED', evaluationErrorCode: STALE_CODE, rowVersion: bump() })
      .where(and(eq(cvVerifications.evaluationStatus, 'RUNNING'), lt(cvVerifications.evaluationRequestedAt, before)))
      .returning({ id: cvVerifications.id });
    return { drafts: drafts.map((row) => row.id), evaluations: evaluations.map((row) => row.id) };
  }

  /** The row of a drafting job, locked: a result applied twice finds it no longer RUNNING. */
  async lockByJob(tx: DbTx, jobId: string): Promise<CvVerificationRecord | undefined> {
    const [row] = await tx.select().from(cvVerifications).where(eq(cvVerifications.jobId, jobId)).for('update');
    return row;
  }

  async lockByEvaluationJob(tx: DbTx, jobId: string): Promise<CvVerificationRecord | undefined> {
    const [row] = await tx
      .select()
      .from(cvVerifications)
      .where(eq(cvVerifications.evaluationJobId, jobId))
      .for('update');
    return row;
  }

  /** The preference's row locked for the start of its exam (US-4.8 AC-4). */
  async lockByPreference(tx: DbTx, preferenceId: number): Promise<CvVerificationRecord | undefined> {
    const [row] = await tx
      .select()
      .from(cvVerifications)
      .where(eq(cvVerifications.preferenceId, preferenceId))
      .for('update');
    return row;
  }

  /** AC-2: the questions in display order, with the model and prompt that drafted them (Invariant 12). */
  async markReady(
    tx: DbTx,
    id: number,
    result: { model: string; promptVersion: string; questions: readonly CvVerificationQuestion[] },
  ): Promise<void> {
    await tx.insert(cvVerificationQuestions).values(
      result.questions.map((question, index) => ({
        verificationId: id,
        no: index + 1,
        stem: question.stem,
        claimRef: question.claim_ref,
        claimLabel: question.claim_label,
      })),
    );
    await tx
      .update(cvVerifications)
      .set({ status: 'READY', model: result.model, promptVersion: result.promptVersion, rowVersion: bump() })
      .where(eq(cvVerifications.id, id));
  }

  /** AC-2: no part D for this preference; a model and prompt are kept when the result had them. */
  async markFailed(tx: DbTx, id: number, code: string, by: { model: string; promptVersion: string } | null): Promise<void> {
    await tx
      .update(cvVerifications)
      .set({
        status: 'FAILED',
        errorCode: code,
        model: by?.model ?? null,
        promptVersion: by?.promptVersion ?? null,
        rowVersion: bump(),
      })
      .where(eq(cvVerifications.id, id));
  }

  async attachToSession(tx: DbTx, id: number, sessionId: number): Promise<void> {
    await tx.update(cvVerifications).set({ sessionId, rowVersion: bump() }).where(eq(cvVerifications.id, id));
  }

  async questionsOf(verificationId: number, tx?: DbTx): Promise<CvVerificationQuestionRecord[]> {
    return (tx ?? this.db)
      .select()
      .from(cvVerificationQuestions)
      .where(eq(cvVerificationQuestions.verificationId, verificationId))
      .orderBy(asc(cvVerificationQuestions.no));
  }

  /** AC-4: what the paper shows of part D, by question id. */
  async stemsOf(questionIds: readonly number[]): Promise<Map<number, string>> {
    if (questionIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: cvVerificationQuestions.id, stem: cvVerificationQuestions.stem })
      .from(cvVerificationQuestions)
      .where(inArray(cvVerificationQuestions.id, [...questionIds]));
    return new Map(rows.map((row) => [row.id, row.stem]));
  }

  /** How many of these questions have an answer; for the counts of a closed session. */
  async countAnswered(questionIds: readonly number[]): Promise<number> {
    if (questionIds.length === 0) return 0;
    const [row] = await this.db
      .select({ count: count() })
      .from(cvVerificationQuestions)
      .where(and(inArray(cvVerificationQuestions.id, [...questionIds]), isNotNull(cvVerificationQuestions.answer)));
    return row?.count ?? 0;
  }

  /** AC-5: written once, in the transaction that closes the session. */
  async writeAnswers(tx: DbTx, rows: readonly { questionId: number; answer: string | null }[]): Promise<void> {
    for (const { questionId, answer } of rows) {
      await tx
        .update(cvVerificationQuestions)
        .set({ answer })
        .where(and(eq(cvVerificationQuestions.id, questionId), isNull(cvVerificationQuestions.answer)));
    }
  }

  async writeEvaluation(tx: DbTx, questionId: number, evaluation: StoredCvEvaluation): Promise<void> {
    await tx.update(cvVerificationQuestions).set({ evaluation }).where(eq(cvVerificationQuestions.id, questionId));
  }

  async finishEvaluation(tx: DbTx, id: number, values: FinishedEvaluation): Promise<void> {
    await tx
      .update(cvVerifications)
      .set({
        evaluationStatus: values.status,
        evaluationModel: values.model,
        evaluationPromptVersion: values.promptVersion,
        evaluationErrorCode: values.errorCode,
        trustX100: values.trustX100,
        trustLevel: values.trustLevel,
        rowVersion: bump(),
      })
      .where(eq(cvVerifications.id, id));
  }

  async findBySession(sessionId: number): Promise<CvVerificationRecord | undefined> {
    const [row] = await this.db.select().from(cvVerifications).where(eq(cvVerifications.sessionId, sessionId));
    return row;
  }

  async findByPreference(preferenceId: number): Promise<CvVerificationRecord | undefined> {
    const [row] = await this.db.select().from(cvVerifications).where(eq(cvVerifications.preferenceId, preferenceId));
    return row;
  }
}
