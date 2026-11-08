import { Inject, Injectable } from '@nestjs/common';
import type { ExamOptionLayout, ExamStoredAnswer, QuestionContent, QuestionType } from '@srm/shared';
import { and, asc, count, eq, gt, inArray, lt, or } from 'drizzle-orm';
import { examAnswers, examSessions, questionBanks, questions } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';

export type ExamSessionRecord = typeof examSessions.$inferSelect;

export interface NewExamSession {
  studentId: number;
  bankId: number;
  bankVersion: number;
  seed: number;
  questionIds: number[];
  optionLayout: ExamOptionLayout;
  startedAt: Date;
  deadlineAt: Date;
}

/** What a student may see of a question (AGENTS › Invariant 8): never `answer_key` or `rubric`. */
export interface QuestionDisplay {
  id: number;
  type: QuestionType;
  content: QuestionContent;
}

export interface NewExamAnswer {
  questionId: number;
  answer: ExamStoredAnswer;
}

/** Drizzle access to `core.exam_sessions` and `core.exam_answers`, owned by the assessment module. */
@Injectable()
export class ExamSessionsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: number, tx?: DbTx): Promise<ExamSessionRecord | undefined> {
    const [row] = await (tx ?? this.db).select().from(examSessions).where(eq(examSessions.id, id));
    return row;
  }

  /** Locks the session row for the rest of the transaction. */
  async lock(tx: DbTx, id: number): Promise<ExamSessionRecord | undefined> {
    const [row] = await tx.select().from(examSessions).where(eq(examSessions.id, id)).for('update');
    return row;
  }

  async findByStudentAndBank(studentId: number, bankId: number, tx?: DbTx): Promise<ExamSessionRecord | undefined> {
    const [row] = await (tx ?? this.db)
      .select()
      .from(examSessions)
      .where(and(eq(examSessions.studentId, studentId), eq(examSessions.bankId, bankId)));
    return row;
  }

  /** The student's sessions of these banks. */
  async listOfStudent(studentId: number, bankIds: readonly number[]): Promise<ExamSessionRecord[]> {
    if (bankIds.length === 0) return [];
    return this.db
      .select()
      .from(examSessions)
      .where(and(eq(examSessions.studentId, studentId), inArray(examSessions.bankId, [...bankIds])));
  }

  /**
   * The new session, or undefined when the student already has one for the bank (BR-06: the unique
   * key decides, whatever the caller checked before).
   */
  async insert(tx: DbTx, values: NewExamSession): Promise<ExamSessionRecord | undefined> {
    const [row] = await tx
      .insert(examSessions)
      .values(values)
      .onConflictDoNothing({ target: [examSessions.studentId, examSessions.bankId] })
      .returning();
    return row;
  }

  /** AC-8: written once, in the transaction that closes the session. */
  async insertAnswers(tx: DbTx, sessionId: number, rows: readonly NewExamAnswer[]): Promise<void> {
    if (rows.length === 0) return;
    await tx
      .insert(examAnswers)
      .values(rows.map((row) => ({ sessionId, ...row })))
      .onConflictDoNothing();
  }

  async countAnswers(sessionId: number, tx?: DbTx): Promise<number> {
    const [row] = await (tx ?? this.db)
      .select({ count: count() })
      .from(examAnswers)
      .where(eq(examAnswers.sessionId, sessionId));
    return row?.count ?? 0;
  }

  /**
   * AC-9: open sessions whose deadline is before `cutoff` (now minus the grace: at the very end of
   * the grace a save is still taken), earliest first; after `after` when paging.
   */
  async listOpenDueBy(
    cutoff: Date,
    limit: number,
    after?: Pick<ExamSessionRecord, 'deadlineAt' | 'id'>,
  ): Promise<ExamSessionRecord[]> {
    const past = after
      ? or(
          gt(examSessions.deadlineAt, after.deadlineAt),
          and(eq(examSessions.deadlineAt, after.deadlineAt), gt(examSessions.id, after.id)),
        )
      : undefined;
    return this.db
      .select()
      .from(examSessions)
      .where(and(eq(examSessions.status, 'IN_PROGRESS'), lt(examSessions.deadlineAt, cutoff), past))
      .orderBy(asc(examSessions.deadlineAt), asc(examSessions.id))
      .limit(limit);
  }

  /**
   * AC-10: the (student, JD) pairs among these students and JDs that have a session, whatever its
   * status. A superset of the pairs asked about; the caller matches them.
   */
  async listSessionPairs(
    studentIds: readonly number[],
    jdIds: readonly number[],
  ): Promise<{ studentId: number; jdId: number }[]> {
    if (studentIds.length === 0 || jdIds.length === 0) return [];
    return this.db
      .select({ studentId: examSessions.studentId, jdId: questionBanks.jdId })
      .from(examSessions)
      .innerJoin(questionBanks, eq(questionBanks.id, examSessions.bankId))
      .where(and(inArray(examSessions.studentId, [...studentIds]), inArray(questionBanks.jdId, [...jdIds])));
  }

  /**
   * AC-7: the questions of a paper as a student sees them, whatever their status now: a question
   * retired after the draw still shows on the paper it was drawn into.
   */
  async displayOf(questionIds: readonly number[]): Promise<QuestionDisplay[]> {
    if (questionIds.length === 0) return [];
    return this.db
      .select({ id: questions.id, type: questions.type, content: questions.content })
      .from(questions)
      .where(inArray(questions.id, [...questionIds]));
  }
}
