import { Inject, Injectable } from '@nestjs/common';
import {
  type CvVerificationSettings,
  type ExamBlueprint,
  type QuestionDifficulty,
  type QuestionRejectReason,
  type QuestionStatus,
  type QuestionType,
  USABLE_QUESTION_STATES,
} from '@srm/shared';
import { and, asc, count, eq, inArray, or, sql } from 'drizzle-orm';
import { RowVersionConflictError } from '../../../common/errors/index.js';
import { questionBanks, questionReviews, questions } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { QUESTION_BANK_ENTITY } from '../domain/audit-actions.js';
import type { QuestionCount, RejectReasonCount } from '../domain/blueprint.js';
import type { StoredQuestion } from '../domain/stored-question.js';

export type QuestionBankRecord = typeof questionBanks.$inferSelect;

export type QuestionRecord = typeof questions.$inferSelect;

/** A question's place in its lifecycle, and its cell. */
export interface QuestionState {
  id: number;
  bankId: number;
  draftId: number;
  status: QuestionStatus;
  rowVersion: number;
  type: QuestionType;
  skill: string;
  difficulty: QuestionDifficulty;
}

/** A DRAFT question as "Kiểm câu bằng AI" picks it: its draft and its cell. */
export interface UncheckedQuestion {
  draftId: number;
  type: QuestionType;
  skill: string;
  difficulty: QuestionDifficulty;
}

export interface NewQuestionBank {
  campaignId: number;
  jdId: number;
  jdVersion: number;
  blueprint: ExamBlueprint;
}

/** Rows written or looked up per statement. */
const WRITE_CHUNK = 500;

const STATE_COLUMNS = {
  id: questions.id,
  bankId: questions.bankId,
  draftId: questions.draftId,
  status: questions.status,
  rowVersion: questions.rowVersion,
  type: questions.type,
  skill: questions.skill,
  difficulty: questions.difficulty,
};

/** Drizzle access to `core.question_banks` and `core.questions`, owned by the assessment module. */
@Injectable()
export class QuestionBanksRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findByJd(jdId: number, tx?: DbTx): Promise<QuestionBankRecord | undefined> {
    const [row] = await (tx ?? this.db).select().from(questionBanks).where(eq(questionBanks.jdId, jdId));
    return row;
  }

  /** The banks of these JDs (US-4.3: the exam list of a student). */
  async findByJds(jdIds: readonly number[]): Promise<QuestionBankRecord[]> {
    if (jdIds.length === 0) return [];
    return this.db
      .select()
      .from(questionBanks)
      .where(inArray(questionBanks.jdId, [...jdIds]));
  }

  /**
   * The JD's bank share-locked for the rest of the transaction (US-4.3: starting an exam): its
   * version cannot rise, nor its status change, before the session drawn from it is written.
   */
  async findByJdForShare(tx: DbTx, jdId: number): Promise<QuestionBankRecord | undefined> {
    const [row] = await tx.select().from(questionBanks).where(eq(questionBanks.jdId, jdId)).for('share');
    return row;
  }

  async findById(id: number, tx?: DbTx): Promise<QuestionBankRecord | undefined> {
    const [row] = await (tx ?? this.db).select().from(questionBanks).where(eq(questionBanks.id, id));
    return row;
  }

  async insert(tx: DbTx, values: NewQuestionBank): Promise<QuestionBankRecord> {
    const [row] = await tx.insert(questionBanks).values(values).returning();
    if (!row) throw new Error('insert into question_banks returned no row');
    return row;
  }

  /** Writes with `WHERE row_version = n` and bumps it; a lost race is a 409. Part C with it (US-4.8). */
  async updateBlueprint(
    tx: DbTx,
    id: number,
    expectedRowVersion: number,
    {
      blueprint,
      jdVersion,
      cvVerification,
    }: { blueprint: ExamBlueprint; jdVersion: number; cvVerification: CvVerificationSettings },
  ): Promise<void> {
    const updated = await tx
      .update(questionBanks)
      .set({
        blueprint,
        jdVersion,
        cvVerificationEnabled: cvVerification.enabled,
        cvVerificationCount: cvVerification.questionCount,
        rowVersion: expectedRowVersion + 1,
      })
      .where(and(eq(questionBanks.id, id), eq(questionBanks.rowVersion, expectedRowVersion)))
      .returning({ id: questionBanks.id });
    if (updated.length === 0) throw new RowVersionConflictError(QUESTION_BANK_ENTITY, id, expectedRowVersion);
  }

  /** Questions of the bank per type, skill, difficulty and status, the skill as the AI wrote it. */
  async countQuestions(bankId: number, tx?: DbTx): Promise<QuestionCount[]> {
    return (tx ?? this.db)
      .select({
        type: questions.type,
        skill: questions.skill,
        difficulty: questions.difficulty,
        status: questions.status,
        count: count(),
      })
      .from(questions)
      .where(eq(questions.bankId, bankId))
      .groupBy(questions.type, questions.skill, questions.difficulty, questions.status);
  }

  /**
   * REJECTED questions of the bank per type, skill, difficulty and reason: CENTER's when it
   * rejected the question by hand (US-4.11), the Validator's otherwise.
   */
  async countRejectReasons(bankId: number, tx?: DbTx): Promise<RejectReasonCount[]> {
    const db = tx ?? this.db;
    // One row per reason of each question: jsonb_array_elements_text is set-returning.
    const reasons = db
      .select({
        type: questions.type,
        skill: questions.skill,
        difficulty: questions.difficulty,
        reason: sql<QuestionRejectReason>`jsonb_array_elements_text(case when ${questions.manualRejection} is not null
          then jsonb_build_array(${questions.manualRejection} -> 'reason') else ${questions.validation} -> 'reasons' end)`.as(
          'reason',
        ),
      })
      .from(questions)
      .where(and(eq(questions.bankId, bankId), eq(questions.status, 'REJECTED')))
      .as('reasons');
    return db
      .select({
        type: reasons.type,
        skill: reasons.skill,
        difficulty: reasons.difficulty,
        reason: reasons.reason,
        count: count(),
      })
      .from(reasons)
      .groupBy(reasons.type, reasons.skill, reasons.difficulty, reasons.reason);
  }

  /** The bank's questions written from these drafts. */
  async statesByDraft(tx: DbTx, bankId: number, draftIds: readonly number[]): Promise<QuestionState[]> {
    if (draftIds.length === 0) return [];
    const rows: QuestionState[] = [];
    for (let start = 0; start < draftIds.length; start += WRITE_CHUNK) {
      const chunk = draftIds.slice(start, start + WRITE_CHUNK);
      rows.push(
        ...(await tx
          .select(STATE_COLUMNS)
          .from(questions)
          .where(and(eq(questions.bankId, bankId), inArray(questions.draftId, chunk)))),
      );
    }
    return rows;
  }

  async findQuestion(id: number, tx?: DbTx): Promise<QuestionState | undefined> {
    const [row] = await (tx ?? this.db).select(STATE_COLUMNS).from(questions).where(eq(questions.id, id));
    return row;
  }

  /** Every question of the bank, whatever its status, by id (US-4.11 AC-1). */
  async allQuestions(bankId: number, tx?: DbTx): Promise<QuestionRecord[]> {
    return (tx ?? this.db).select().from(questions).where(eq(questions.bankId, bankId)).orderBy(asc(questions.id));
  }

  /** DRAFT and VALIDATED questions of the bank, by id: what an exam is drawn from (US-4.2 AC-8, US-4.10 AC-4). */
  async usableQuestions(bankId: number, tx?: DbTx): Promise<QuestionRecord[]> {
    return (tx ?? this.db)
      .select()
      .from(questions)
      .where(and(eq(questions.bankId, bankId), inArray(questions.status, [...USABLE_QUESTION_STATES])))
      .orderBy(asc(questions.id));
  }

  /**
   * What the review sample is drawn from (US-4.9 AC-1): the usable questions of the bank, and those
   * someone reviewed whatever their status now, so a question reported wrong keeps its place in the
   * sample instead of being replaced.
   */
  async reviewCandidates(bankId: number, tx?: DbTx): Promise<QuestionRecord[]> {
    const reviewed = (tx ?? this.db).select({ id: questionReviews.questionId }).from(questionReviews);
    return (tx ?? this.db)
      .select()
      .from(questions)
      .where(
        and(
          eq(questions.bankId, bankId),
          or(inArray(questions.status, [...USABLE_QUESTION_STATES]), inArray(questions.id, reviewed)),
        ),
      )
      .orderBy(asc(questions.id));
  }

  /** DRAFT questions of the bank, oldest draft first: those nobody has checked (US-4.10 AC-2). */
  async uncheckedQuestions(tx: DbTx, bankId: number): Promise<UncheckedQuestion[]> {
    return tx
      .select({ draftId: questions.draftId, type: questions.type, skill: questions.skill, difficulty: questions.difficulty })
      .from(questions)
      .where(and(eq(questions.bankId, bankId), eq(questions.status, 'DRAFT')))
      .orderBy(asc(questions.draftId));
  }

  /** One more version of a locked bank (US-4.2 AC-7), under the bank's row lock. */
  async bumpVersion(tx: DbTx, bank: QuestionBankRecord): Promise<{ version: number; rowVersion: number }> {
    const [row] = await tx
      .update(questionBanks)
      .set({ version: bank.version + 1, rowVersion: bank.rowVersion + 1 })
      .where(and(eq(questionBanks.id, bank.id), eq(questionBanks.rowVersion, bank.rowVersion)))
      .returning({ version: questionBanks.version, rowVersion: questionBanks.rowVersion });
    if (!row) throw new RowVersionConflictError(QUESTION_BANK_ENTITY, bank.id, bank.rowVersion);
    return row;
  }

  /** AC-9: stores each draft once by `draft_id`; returns how many rows are new. */
  async insertQuestions(tx: DbTx, bankId: number, rows: readonly StoredQuestion[]): Promise<number> {
    let inserted = 0;
    for (let start = 0; start < rows.length; start += WRITE_CHUNK) {
      const chunk = rows.slice(start, start + WRITE_CHUNK).map((row) => ({ ...row, bankId, status: 'DRAFT' as const }));
      const written = await tx
        .insert(questions)
        .values(chunk)
        .onConflictDoNothing({ target: questions.draftId })
        .returning({ id: questions.id });
      inserted += written.length;
    }
    return inserted;
  }

  /** Locks the bank row for the rest of the transaction. */
  async lock(tx: DbTx, id: number): Promise<QuestionBankRecord | undefined> {
    const [row] = await tx.select().from(questionBanks).where(eq(questionBanks.id, id)).for('update');
    return row;
  }
}
