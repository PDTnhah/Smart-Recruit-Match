import { Inject, Injectable } from '@nestjs/common';
import type {
  ExamAnswerAiGrading,
  ExamGradingReason,
  ExamSessionFlag,
  ExamStoredAnswer,
  QuestionRubric,
  QuestionType,
  StoredSkillScore,
} from '@srm/shared';
import { and, asc, eq, gt, inArray, isNull, lt, ne, type SQL, sql } from 'drizzle-orm';
import { RowVersionConflictError } from '../../../common/errors/index.js';
import { examAnswers, examSessions, questionBanks, questions } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { EXAM_SESSION_ENTITY } from '../domain/audit-actions.js';
import type { McqGrade } from '../domain/scoring.js';

/** A question of a paper as grading reads it; `stem` is what the student saw. */
export interface PaperQuestionRow {
  id: number;
  type: QuestionType;
  skill: string;
  rubric: QuestionRubric | null;
  stem: string;
}

/** An answer of a session with its question's type and what grading stored. */
export interface GradedAnswerRow {
  questionId: number;
  type: QuestionType;
  answer: ExamStoredAnswer;
  finalScore: number | null;
  needsHuman: boolean;
  aiGrading: ExamAnswerAiGrading | null;
}

/** An answered MCQ without its grade, with the option the answer key holds. */
export interface UngradedMcqRow {
  questionId: number;
  answer: ExamStoredAnswer;
  correctOption: number | null;
}

/** An essay answer locked for a result of the Grader, with its question's rubric. */
export interface LockedEssayAnswer {
  sessionId: number;
  questionId: number;
  finalScore: number | null;
  aiGrading: ExamAnswerAiGrading | null;
  rubric: QuestionRubric | null;
}

/** A published session, for the threshold sweep. */
export interface PublishedSessionRow {
  sessionId: number;
  studentId: number;
  jdId: number;
  sTest: number;
}

export interface SessionResults {
  scoreAX100: number;
  scoreBX100: number;
  sTestX100: number;
  skillScores: StoredSkillScore[];
  publishedAt: Date;
}

/** Rows read or written per statement. */
const CHUNK = 500;

const isClosed = ne(examSessions.status, 'IN_PROGRESS');

const ofCampaign = (campaignId: number): SQL =>
  inArray(
    examSessions.bankId,
    sql`(select ${questionBanks.id} from ${questionBanks} where ${questionBanks.campaignId} = ${campaignId})`,
  );

const ofCampaigns = (campaignIds: readonly number[]): SQL =>
  inArray(
    examSessions.bankId,
    sql`(select ${questionBanks.id} from ${questionBanks} where ${inArray(questionBanks.campaignId, [...campaignIds])})`,
  );

/** The `ai_grading` value `column` holds both passes, each graded or failed. */
const hasBothPasses = (column: SQL): SQL => {
  const has = (n: '1' | '2') =>
    sql`coalesce((${column} -> 'runs') ? ${sql.raw(`'${n}'`)} or (${column} -> 'failures') ? ${sql.raw(`'${n}'`)}, false)`;
  return sql`(${has('1')} and ${has('2')})`;
};

/** Essay answers of the run's sessions without a final score and a pass missing. */
const incompleteOfRun = (runId: number): SQL | undefined =>
  and(
    eq(examSessions.essayRunId, runId),
    eq(questions.type, 'ESSAY'),
    isNull(examAnswers.finalScore),
    sql`not ${hasBothPasses(sql`${examAnswers.aiGrading}`)}`,
  );

/** `ai_grading` of the answer `a` of `essayWithoutScore`. */
const answerAiGrading = sql.raw('a.ai_grading');

/** Some answered essay of the session has no final score yet, and matches `extra` when given. */
const essayWithoutScore = (extra?: SQL): SQL =>
  sql`exists (select 1 from ${examAnswers} a join ${questions} q on q.id = a.question_id where a.session_id = ${examSessions.id} and q.type = 'ESSAY' and a.final_score is null${extra ? sql` and (${extra})` : sql``})`;

/**
 * Grading reads and writes of `core.exam_sessions` and `core.exam_answers` (US-4.4, CONTEXT D53),
 * owned by the assessment module. Scores are stored in points with two decimals; callers pass
 * hundredths (AGENTS › Invariant 9).
 */
@Injectable()
export class ExamGradingRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** The questions of a paper, whatever their status now. */
  async paperQuestions(questionIds: readonly number[], tx: DbTx | Database = this.db): Promise<PaperQuestionRow[]> {
    if (questionIds.length === 0) return [];
    return tx
      .select({
        id: questions.id,
        type: questions.type,
        skill: questions.skill,
        rubric: questions.rubric,
        stem: sql<string>`${questions.content} ->> 'stem'`,
      })
      .from(questions)
      .where(inArray(questions.id, [...questionIds]));
  }

  async answersOf(sessionId: number, tx: DbTx | Database = this.db): Promise<GradedAnswerRow[]> {
    return tx
      .select({
        questionId: examAnswers.questionId,
        type: questions.type,
        answer: examAnswers.answer,
        finalScore: examAnswers.finalScore,
        needsHuman: examAnswers.needsHuman,
        aiGrading: examAnswers.aiGrading,
      })
      .from(examAnswers)
      .innerJoin(questions, eq(questions.id, examAnswers.questionId))
      .where(eq(examAnswers.sessionId, sessionId))
      .orderBy(asc(examAnswers.questionId));
  }

  /** AC-1: the session's answered MCQs without `auto_score`. */
  async ungradedMcq(tx: DbTx, sessionId: number): Promise<UngradedMcqRow[]> {
    return tx
      .select({
        questionId: examAnswers.questionId,
        answer: examAnswers.answer,
        correctOption: sql<number | null>`(${questions.answerKey} ->> 'correct_option')::int`,
      })
      .from(examAnswers)
      .innerJoin(questions, eq(questions.id, examAnswers.questionId))
      .where(and(eq(examAnswers.sessionId, sessionId), eq(questions.type, 'MCQ'), isNull(examAnswers.autoScore)));
  }

  /** AC-1: the code's grade is also the final score of an MCQ. */
  async writeMcqGrades(tx: DbTx, sessionId: number, grades: readonly McqGrade[]): Promise<void> {
    for (const { questionId, points } of grades) {
      await tx
        .update(examAnswers)
        .set({ autoScore: points, finalScore: points })
        .where(and(eq(examAnswers.sessionId, sessionId), eq(examAnswers.questionId, questionId)));
    }
  }

  /** AC-6: essays whose final score is the Grader's, × 100. */
  async writeEssayScores(
    tx: DbTx,
    sessionId: number,
    scores: readonly { questionId: number; finalScoreX100: number }[],
  ): Promise<void> {
    for (const { questionId, finalScoreX100 } of scores) {
      await tx
        .update(examAnswers)
        .set({ finalScore: finalScoreX100 / 100 })
        .where(
          and(eq(examAnswers.sessionId, sessionId), eq(examAnswers.questionId, questionId), isNull(examAnswers.finalScore)),
        );
    }
  }

  /** AC-6: essays sent to a human grader (US-4.5), with every reason. */
  async writeHandoffs(
    tx: DbTx,
    sessionId: number,
    handoffs: readonly { questionId: number; reasons: ExamGradingReason[] }[],
  ): Promise<void> {
    for (const { questionId, reasons } of handoffs) {
      await tx
        .update(examAnswers)
        .set({ needsHuman: true, needsHumanReasons: reasons })
        .where(and(eq(examAnswers.sessionId, sessionId), eq(examAnswers.questionId, questionId)));
    }
  }

  /** Writes `flags` under the session's row lock; returns the new row version. */
  async writeFlags(tx: DbTx, sessionId: number, rowVersion: number, flags: ExamSessionFlag[]): Promise<number> {
    const [row] = await tx
      .update(examSessions)
      .set({ flags, rowVersion: rowVersion + 1 })
      .where(and(eq(examSessions.id, sessionId), eq(examSessions.rowVersion, rowVersion)))
      .returning({ rowVersion: examSessions.rowVersion });
    if (!row) throw new RowVersionConflictError(EXAM_SESSION_ENTITY, sessionId, rowVersion);
    return row.rowVersion;
  }

  /** AC-11: the scores and the publication, in one UPDATE (CHECK `exam_sessions_results_check`). */
  async publish(tx: DbTx, sessionId: number, rowVersion: number, results: SessionResults): Promise<void> {
    const [row] = await tx
      .update(examSessions)
      .set({
        scoreA: results.scoreAX100 / 100,
        scoreB: results.scoreBX100 / 100,
        sTest: results.sTestX100 / 100,
        skillScores: results.skillScores,
        resultsPublishedAt: results.publishedAt,
        rowVersion: rowVersion + 1,
      })
      .where(and(eq(examSessions.id, sessionId), eq(examSessions.rowVersion, rowVersion)))
      .returning({ id: examSessions.id });
    if (!row) throw new RowVersionConflictError(EXAM_SESSION_ENTITY, sessionId, rowVersion);
  }

  // --- The grading sweep and the essay dispatch ----------------------------------------------------

  /**
   * Closed, unpublished sessions whose every answered essay has its final score, or both passes
   * and no handoff yet: `finalizeIfReady` has something to decide. Of one campaign when given;
   * none of the campaigns in `exceptCampaignIds` (those still before `testing_end`).
   */
  async listReadyToPublish(
    limit: number,
    options: { afterId?: number; campaignId?: number; exceptCampaignIds?: readonly number[] } = {},
  ): Promise<number[]> {
    const rows = await this.db
      .select({ id: examSessions.id })
      .from(examSessions)
      .where(
        and(
          isClosed,
          isNull(examSessions.resultsPublishedAt),
          sql`not ${essayWithoutScore(sql`a.needs_human or not ${hasBothPasses(answerAiGrading)}`)}`,
          options.afterId === undefined ? undefined : gt(examSessions.id, options.afterId),
          options.campaignId === undefined ? undefined : ofCampaign(options.campaignId),
          options.exceptCampaignIds?.length ? sql`not ${ofCampaigns(options.exceptCampaignIds)}` : undefined,
        ),
      )
      .orderBy(asc(examSessions.id))
      .limit(limit);
    return rows.map((row) => row.id);
  }

  /** Whether a session of the campaign is still open: the essay job waits for it (CONTEXT D53). */
  async hasOpenSessions(campaignId: number): Promise<boolean> {
    const [row] = await this.db
      .select({ id: examSessions.id })
      .from(examSessions)
      .where(and(eq(examSessions.status, 'IN_PROGRESS'), ofCampaign(campaignId)))
      .limit(1);
    return row !== undefined;
  }

  /**
   * AC-2: closed sessions of the campaign never sent to the Grader, with an answered essay still
   * without a score or a handoff; by id, at most `limit`. Under the campaign's dispatch lock.
   */
  async listDispatchable(tx: DbTx, campaignId: number, limit: number): Promise<number[]> {
    const rows = await tx
      .select({ id: examSessions.id })
      .from(examSessions)
      .where(
        and(
          isClosed,
          isNull(examSessions.essayRunId),
          isNull(examSessions.resultsPublishedAt),
          ofCampaign(campaignId),
          essayWithoutScore(sql`not a.needs_human`),
        ),
      )
      .orderBy(asc(examSessions.id))
      .limit(limit);
    return rows.map((row) => row.id);
  }

  /** AC-2: each session is sent once; one sent meanwhile keeps its run. */
  async assignRun(tx: DbTx, sessionIds: readonly number[], runId: number): Promise<void> {
    for (let start = 0; start < sessionIds.length; start += CHUNK) {
      await tx
        .update(examSessions)
        .set({ essayRunId: runId })
        .where(and(inArray(examSessions.id, sessionIds.slice(start, start + CHUNK)), isNull(examSessions.essayRunId)));
    }
  }

  async sessionIdsOfRun(runId: number, tx: DbTx | Database = this.db): Promise<number[]> {
    const rows = await tx
      .select({ id: examSessions.id })
      .from(examSessions)
      .where(eq(examSessions.essayRunId, runId))
      .orderBy(asc(examSessions.id));
    return rows.map((row) => row.id);
  }

  /**
   * The essay answers a result names, locked in a fixed order, with their rubric: two messages of
   * one job never write the same pass twice. Pairs that are not essays are left out. The rows are
   * locked first, on `exam_answers` alone, then read with their question: PostgreSQL takes no
   * schema-qualified table in `FOR UPDATE OF`, and the questions themselves need no lock.
   */
  async lockEssayAnswers(
    tx: DbTx,
    pairs: readonly { sessionId: number; questionId: number }[],
  ): Promise<LockedEssayAnswer[]> {
    const locked: LockedEssayAnswer[] = [];
    for (let start = 0; start < pairs.length; start += CHUNK) {
      const values = pairs
        .slice(start, start + CHUNK)
        .map((pair) => sql`(${pair.sessionId}::bigint, ${pair.questionId}::bigint)`);
      const named = sql`(${examAnswers.sessionId}, ${examAnswers.questionId}) in (${sql.join(values, sql`, `)})`;
      await tx
        .select({ sessionId: examAnswers.sessionId })
        .from(examAnswers)
        .where(named)
        .orderBy(asc(examAnswers.sessionId), asc(examAnswers.questionId))
        .for('update');
      locked.push(
        ...(await tx
          .select({
            sessionId: examAnswers.sessionId,
            questionId: examAnswers.questionId,
            finalScore: examAnswers.finalScore,
            aiGrading: examAnswers.aiGrading,
            rubric: questions.rubric,
          })
          .from(examAnswers)
          .innerJoin(questions, eq(questions.id, examAnswers.questionId))
          .where(and(eq(questions.type, 'ESSAY'), named))
          .orderBy(asc(examAnswers.sessionId), asc(examAnswers.questionId))),
      );
    }
    return locked;
  }

  /**
   * The essay answers of a run's sessions still without a final score and a pass missing, locked:
   * a job that failed whole, or a stale run, turns those passes into failures (CONTEXT D53). Read
   * again under the lock, since a message of the job may have written a pass meanwhile.
   */
  async lockIncompleteOfRun(tx: DbTx, runId: number): Promise<LockedEssayAnswer[]> {
    const pairs = await tx
      .select({ sessionId: examAnswers.sessionId, questionId: examAnswers.questionId })
      .from(examAnswers)
      .innerJoin(questions, eq(questions.id, examAnswers.questionId))
      .innerJoin(examSessions, eq(examSessions.id, examAnswers.sessionId))
      .where(incompleteOfRun(runId));
    const locked = await this.lockEssayAnswers(tx, pairs);
    return locked.filter((answer) => answer.finalScore === null);
  }

  /** How many essay answers of a run's sessions still wait for a pass (no lock: under the run's). */
  async countIncompleteOfRun(tx: DbTx, runId: number): Promise<number> {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(examAnswers)
      .innerJoin(questions, eq(questions.id, examAnswers.questionId))
      .innerJoin(examSessions, eq(examSessions.id, examAnswers.sessionId))
      .where(incompleteOfRun(runId));
    return row?.count ?? 0;
  }

  async writeAiGrading(tx: DbTx, sessionId: number, questionId: number, aiGrading: ExamAnswerAiGrading): Promise<void> {
    await tx
      .update(examAnswers)
      .set({ aiGrading })
      .where(and(eq(examAnswers.sessionId, sessionId), eq(examAnswers.questionId, questionId)));
  }

  /** AC-14: sessions of the campaign whose results were published before `cutoff`. */
  async listPublishedBefore(campaignId: number, cutoff: Date): Promise<PublishedSessionRow[]> {
    const rows = await this.db
      .select({
        sessionId: examSessions.id,
        studentId: examSessions.studentId,
        jdId: questionBanks.jdId,
        sTest: examSessions.sTest,
      })
      .from(examSessions)
      .innerJoin(questionBanks, eq(questionBanks.id, examSessions.bankId))
      .where(and(eq(questionBanks.campaignId, campaignId), lt(examSessions.resultsPublishedAt, cutoff)))
      .orderBy(asc(examSessions.id));
    return rows.flatMap((row) => (row.sTest === null ? [] : [{ ...row, sTest: row.sTest }]));
  }
}
