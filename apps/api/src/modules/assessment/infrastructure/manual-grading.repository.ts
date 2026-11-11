import { Inject, Injectable } from '@nestjs/common';
import type {
  ExamAnswerAiGrading,
  ExamGradingReason,
  ExamStoredAnswer,
  QuestionRubric,
  QuestionType,
  StoredManualGrading,
} from '@srm/shared';
import { and, asc, eq, inArray, isNotNull, isNull, type SQL, sql } from 'drizzle-orm';
import { RowVersionConflictError } from '../../../common/errors/index.js';
import { examAnswers, examSessions, questionBanks, questions } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { EXAM_ANSWER_ENTITY } from '../domain/audit-actions.js';
import { ofCampaign } from './exam-grading.repository.js';

/** A session of the queue page, with what numbers its answers. */
export interface QueueSessionRow {
  sessionId: number;
  jdId: number;
  submittedAt: Date;
  questionIds: number[];
}

/** An answer of the queue page: an essay, so it has a rubric (CHECK `questions_rubric_check`). */
export interface QueueAnswerRow {
  answerId: number;
  sessionId: number;
  questionId: number;
  skill: string;
  rubric: QuestionRubric;
  reasons: ExamGradingReason[];
}

/** An answer with its question, session and grade, for the grading pane. */
export interface ManualGradingRow {
  answerId: number;
  sessionId: number;
  questionId: number;
  answer: ExamStoredAnswer;
  aiGrading: ExamAnswerAiGrading | null;
  needsHuman: boolean;
  reasons: ExamGradingReason[];
  finalScore: number | null;
  manualGrading: StoredManualGrading | null;
  gradedAt: Date | null;
  rowVersion: number;
  type: QuestionType;
  skill: string;
  stem: string;
  rubric: QuestionRubric | null;
  sampleAnswer: string | null;
  questionIds: number[];
  jdId: number;
}

export interface ManualGradeWrite {
  finalScoreX100: number;
  manualGrading: StoredManualGrading;
  gradedBy: number;
  gradedAt: Date;
}

/** An answer still waiting for a human grader (partial index `exam_answers_needs_human_idx`). */
const waiting = sql`(${examAnswers.needsHuman} and ${examAnswers.finalScore} is null)`;

/** The answer is to an essay, so its question has a rubric. */
const ofEssay = sql`${examAnswers.questionId} in (select ${questions.id} from ${questions} where ${questions.type} = 'ESSAY')`;

const withReason = (reason: ExamGradingReason | undefined): SQL | undefined =>
  reason === undefined ? undefined : sql`${reason} = any(${examAnswers.needsHumanReasons})`;

/**
 * Manual grading reads and writes of `core.exam_answers` (US-4.5, CONTEXT D54), owned by the
 * assessment module. Scores are stored in points with two decimals; callers pass hundredths
 * (AGENTS › Invariant 9).
 */
@Injectable()
export class ManualGradingRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * AC-1: a page of the campaign's submitted sessions with an essay waiting for a grader (with
   * `reason` when given), oldest first, and how many sessions and answers wait in all. Every
   * condition is in SQL, so the page and the totals count the same rows.
   */
  async listQueue(
    campaignId: number,
    page: { reason?: ExamGradingReason; limit: number; offset: number },
  ): Promise<{ sessions: QueueSessionRow[]; answers: QueueAnswerRow[]; totalSessions: number; totalAnswers: number }> {
    const answerFilter = and(waiting, ofEssay, withReason(page.reason));
    const submitted = isNotNull(examSessions.submittedAt);
    const [totals] = await this.db
      .select({
        sessions: sql<number>`count(distinct ${examAnswers.sessionId})::int`,
        answers: sql<number>`count(*)::int`,
      })
      .from(examAnswers)
      .innerJoin(examSessions, eq(examSessions.id, examAnswers.sessionId))
      .where(and(answerFilter, submitted, ofCampaign(campaignId)));
    const sessions = await this.db
      .select({
        sessionId: examSessions.id,
        jdId: questionBanks.jdId,
        submittedAt: examSessions.submittedAt,
        questionIds: examSessions.questionIds,
      })
      .from(examSessions)
      .innerJoin(questionBanks, eq(questionBanks.id, examSessions.bankId))
      .where(
        and(
          eq(questionBanks.campaignId, campaignId),
          submitted,
          sql`exists (select 1 from ${examAnswers} where ${examAnswers.sessionId} = ${examSessions.id} and ${answerFilter})`,
        ),
      )
      .orderBy(asc(examSessions.id))
      .limit(page.limit)
      .offset(page.offset);
    const answers =
      sessions.length === 0
        ? []
        : await this.db
            .select({
              answerId: examAnswers.id,
              sessionId: examAnswers.sessionId,
              questionId: examAnswers.questionId,
              skill: questions.skill,
              rubric: questions.rubric,
              reasons: examAnswers.needsHumanReasons,
            })
            .from(examAnswers)
            .innerJoin(questions, eq(questions.id, examAnswers.questionId))
            .where(
              and(
                inArray(
                  examAnswers.sessionId,
                  sessions.map((session) => session.sessionId),
                ),
                answerFilter,
              ),
            );
    return {
      // Both set by the filters above: a submitted session, an essay's rubric.
      sessions: sessions.map((session) => ({ ...session, submittedAt: session.submittedAt! })),
      answers: answers.map((answer) => ({ ...answer, rubric: answer.rubric! })),
      totalSessions: totals?.sessions ?? 0,
      totalAnswers: totals?.answers ?? 0,
    };
  }

  /** AC-2: the answer with its question, the session's paper and the bank's JD; no lock. */
  async findForGrading(answerId: number, tx: DbTx | Database = this.db): Promise<ManualGradingRow | undefined> {
    const [row] = await tx
      .select({
        answerId: examAnswers.id,
        sessionId: examAnswers.sessionId,
        questionId: examAnswers.questionId,
        answer: examAnswers.answer,
        aiGrading: examAnswers.aiGrading,
        needsHuman: examAnswers.needsHuman,
        reasons: examAnswers.needsHumanReasons,
        finalScore: examAnswers.finalScore,
        manualGrading: examAnswers.manualGrading,
        gradedAt: examAnswers.gradedAt,
        rowVersion: examAnswers.rowVersion,
        type: questions.type,
        skill: questions.skill,
        stem: sql<string>`${questions.content} ->> 'stem'`,
        rubric: questions.rubric,
        sampleAnswer: sql<string | null>`${questions.answerKey} ->> 'sample_answer'`,
        questionIds: examSessions.questionIds,
        jdId: questionBanks.jdId,
      })
      .from(examAnswers)
      .innerJoin(questions, eq(questions.id, examAnswers.questionId))
      .innerJoin(examSessions, eq(examSessions.id, examAnswers.sessionId))
      .innerJoin(questionBanks, eq(questionBanks.id, examSessions.bankId))
      .where(eq(examAnswers.id, answerId));
    return row;
  }

  /**
   * AC-3, AC-4: locks the answer row, then reads it with its question, as `findForGrading` does.
   * Locked on `exam_answers` alone: PostgreSQL takes no schema-qualified table in `FOR UPDATE OF`
   * (LESSONS §12).
   */
  async lockForGrade(tx: DbTx, answerId: number): Promise<ManualGradingRow | undefined> {
    const [locked] = await tx.select({ id: examAnswers.id }).from(examAnswers).where(eq(examAnswers.id, answerId)).for('update');
    return locked ? this.findForGrading(answerId, tx) : undefined;
  }

  /**
   * AC-3: the human grade, the final score and a new row version in one UPDATE (CHECK
   * `exam_answers_manual_check`); a row changed or graded meanwhile is a conflict.
   */
  async writeManualGrade(tx: DbTx, answerId: number, rowVersion: number, grade: ManualGradeWrite): Promise<number> {
    const [row] = await tx
      .update(examAnswers)
      .set({
        finalScore: grade.finalScoreX100 / 100,
        manualGrading: grade.manualGrading,
        gradedBy: grade.gradedBy,
        gradedAt: grade.gradedAt,
        rowVersion: rowVersion + 1,
      })
      .where(and(eq(examAnswers.id, answerId), eq(examAnswers.rowVersion, rowVersion), isNull(examAnswers.finalScore)))
      .returning({ rowVersion: examAnswers.rowVersion });
    if (!row) throw new RowVersionConflictError(EXAM_ANSWER_ENTITY, answerId, rowVersion);
    return row.rowVersion;
  }

  /** AC-5: answers of the session still waiting for a grader. */
  async countWaiting(sessionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(examAnswers)
      .where(and(eq(examAnswers.sessionId, sessionId), waiting));
    return row?.count ?? 0;
  }
}
