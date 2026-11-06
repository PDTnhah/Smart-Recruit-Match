import { Inject, Injectable } from '@nestjs/common';
import type { ExamBlueprint } from '@srm/shared';
import { and, count, eq } from 'drizzle-orm';
import { RowVersionConflictError } from '../../../common/errors/index.js';
import { questionBanks, questions } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import type { DraftCount } from '../domain/blueprint.js';
import { QUESTION_BANK_ENTITY } from '../domain/audit-actions.js';
import type { StoredQuestion } from '../domain/stored-question.js';

export type QuestionBankRecord = typeof questionBanks.$inferSelect;

export interface NewQuestionBank {
  campaignId: number;
  jdId: number;
  jdVersion: number;
  blueprint: ExamBlueprint;
}

/** Rows written per statement. */
const WRITE_CHUNK = 500;

/** Drizzle access to `core.question_banks` and `core.questions`, owned by the assessment module. */
@Injectable()
export class QuestionBanksRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findByJd(jdId: number, tx?: DbTx): Promise<QuestionBankRecord | undefined> {
    const [row] = await (tx ?? this.db).select().from(questionBanks).where(eq(questionBanks.jdId, jdId));
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

  /** Writes with `WHERE row_version = n` and bumps it; a lost race is a 409. */
  async updateBlueprint(
    tx: DbTx,
    id: number,
    expectedRowVersion: number,
    { blueprint, jdVersion }: { blueprint: ExamBlueprint; jdVersion: number },
  ): Promise<void> {
    const updated = await tx
      .update(questionBanks)
      .set({ blueprint, jdVersion, rowVersion: expectedRowVersion + 1 })
      .where(and(eq(questionBanks.id, id), eq(questionBanks.rowVersion, expectedRowVersion)))
      .returning({ id: questionBanks.id });
    if (updated.length === 0) throw new RowVersionConflictError(QUESTION_BANK_ENTITY, id, expectedRowVersion);
  }

  /** Drafts of the bank per type, skill and difficulty, the skill as the AI wrote it. */
  async countDrafts(bankId: number): Promise<DraftCount[]> {
    return this.db
      .select({ type: questions.type, skill: questions.skill, difficulty: questions.difficulty, count: count() })
      .from(questions)
      .where(and(eq(questions.bankId, bankId), eq(questions.status, 'DRAFT')))
      .groupBy(questions.type, questions.skill, questions.difficulty);
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
