import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  GradingQueue,
  GradingQueueQuery,
  ManualGradePublication,
  ManualGradeRequest,
  ManualGradeResult,
  ManualGradingDetail,
  QuestionRubric,
} from '@srm/shared';
import type { AuthUser } from '../../../common/auth/index.js';
import { Clock } from '../../../common/clock/index.js';
import {
  EntityNotFoundError,
  errorMessage,
  ExamAnswerAlreadyGradedError,
  RowVersionConflictError,
} from '../../../common/errors/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { AuditService, userActor } from '../../audit/index.js';
import { CampaignService } from '../../campaign/index.js';
import { JdService, type ShortlistJdCard } from '../../company/index.js';
import { ASSESSMENT_AUDIT_ACTIONS, EXAM_ANSWER_ENTITY } from '../domain/audit-actions.js';
import { rubricPoints } from '../domain/essay-pass.js';
import { aiPassesOf, manualGradeOf, questionNoOf } from '../domain/manual-grade.js';
import { ManualGradingRepository, type ManualGradingRow } from '../infrastructure/manual-grading.repository.js';
import { type FinalizeOutcome, GradingService } from './grading.service.js';

/**
 * Manual grading of the essays the Grader handed over (FR-23, US-4.5, CONTEXT D54). CENTER only;
 * every response is a whitelist without the student (BR-03). The grader enters points per rubric
 * criterion, code adds them (AD-2); the grade is written with its audit entry under the answer's
 * row lock, then the session's results go through `GradingService.finalizeIfReady`, the one path
 * that publishes them (CONTEXT D53). No LLM, no AI job (BR-13).
 */
/**
 * How `finalizeIfReady` ended, for the grader (AC-5). ALREADY_PUBLISHED: two graders saved a
 * session's last answers at once and the other one published. NO_SCV and CONFLICT are left to the
 * grading sweep, which logs them again.
 */
function publicationOf(kind: FinalizeOutcome['kind']): ManualGradePublication {
  switch (kind) {
    case 'PUBLISHED':
    case 'ALREADY_PUBLISHED':
      return 'PUBLISHED';
    case 'NOT_DUE':
      return 'AFTER_TESTING_END';
    case 'NEEDS_HUMAN':
      return 'WAITING_OTHER_ANSWERS';
    default:
      return 'NEXT_SWEEP';
  }
}

@Injectable()
export class ManualGradingService {
  private readonly logger = new Logger(ManualGradingService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly clock: Clock,
    private readonly repository: ManualGradingRepository,
    private readonly grading: GradingService,
    private readonly campaigns: CampaignService,
    private readonly jds: JdService,
    private readonly audit: AuditService,
  ) {}

  /** AC-1: the campaign's sessions with an essay waiting for a grader; 404 for no such campaign. */
  async queue(campaignId: number, query: GradingQueueQuery): Promise<GradingQueue> {
    await this.campaigns.getSettings(campaignId);
    const page = await this.repository.listQueue(campaignId, query);
    const cards = await this.jds.listCardsByIds([...new Set(page.sessions.map((session) => session.jdId))]);
    const cardOf = new Map(cards.map((card) => [card.jdId, card]));
    const items = page.sessions.map((session) => {
      const answers = page.answers
        .filter((answer) => answer.sessionId === session.sessionId)
        .map((answer) => ({
          answerId: answer.answerId,
          questionNo: questionNoOf(session.questionIds, answer.questionId),
          skill: answer.skill,
          maxPoints: rubricPoints(answer.rubric),
          reasons: answer.reasons,
        }))
        .sort((a, b) => a.questionNo - b.questionNo);
      const card = cardOf.get(session.jdId);
      return {
        sessionId: session.sessionId,
        jdTitle: card?.title ?? `JD #${session.jdId}`,
        companyName: card?.companyName ?? '',
        submittedAt: session.submittedAt.toISOString(),
        answers,
      };
    });
    return { items, totalSessions: page.totalSessions, totalAnswers: page.totalAnswers };
  }

  /**
   * AC-2: what the grader needs for one answer. 404 unless it is an essay that went to a human
   * grader; once graded it is still shown, with the grade, read only.
   */
  async detail(answerId: number): Promise<ManualGradingDetail> {
    const row = await this.repository.findForGrading(answerId);
    if (!row || row.type !== 'ESSAY' || !row.needsHuman || !row.rubric) {
      throw new EntityNotFoundError(EXAM_ANSWER_ENTITY, answerId);
    }
    const [card] = await this.jds.listCardsByIds([row.jdId]);
    return this.detailOf(row, row.rubric, card);
  }

  /**
   * AC-3–AC-5: in one transaction, under the answer's row lock: 404 unless an essay waiting for a
   * grader; 409 EXAM_ANSWER_ALREADY_GRADED once it has a final score, checked first; 409
   * ROW_VERSION_CONFLICT on a stale row version; 400 when the criteria do not follow the rubric.
   * Writes the grade and its audit entry; what the response shows is read in the transaction too.
   * After the commit, a session with nothing left to grade goes through `finalizeIfReady`; whatever
   * happens then, the grade stays and the API answers 200.
   */
  async grade(answerId: number, body: ManualGradeRequest, user: AuthUser): Promise<ManualGradeResult> {
    const graded = await this.db.transaction(async (tx) => {
      const locked = await this.repository.lockForGrade(tx, answerId);
      if (!locked || locked.type !== 'ESSAY' || !locked.needsHuman || !locked.rubric) {
        throw new EntityNotFoundError(EXAM_ANSWER_ENTITY, answerId);
      }
      if (locked.finalScore !== null) throw new ExamAnswerAlreadyGradedError(answerId);
      if (locked.rowVersion !== body.rowVersion) {
        throw new RowVersionConflictError(EXAM_ANSWER_ENTITY, answerId, body.rowVersion, locked.rowVersion);
      }
      const grade = manualGradeOf(locked.rubric, body.criteria, body.note);
      const gradedAt = this.clock.now();
      const rowVersion = await this.repository.writeManualGrade(tx, answerId, locked.rowVersion, {
        finalScoreX100: grade.finalScoreX100,
        manualGrading: grade.stored,
        gradedBy: user.userId,
        gradedAt,
      });
      await this.audit.record(tx, {
        actor: userActor(user),
        action: ASSESSMENT_AUDIT_ACTIONS.EXAM_ANSWER_GRADED_MANUALLY,
        entity: EXAM_ANSWER_ENTITY,
        entityId: answerId,
        before: { finalScore: null, rowVersion: locked.rowVersion },
        after: {
          sessionId: locked.sessionId,
          questionId: locked.questionId,
          finalScore: grade.finalScoreX100 / 100,
          criteria: grade.stored.criteria,
          note: grade.stored.note,
          rowVersion,
        },
      });
      const [card] = await this.jds.listCardsByIds([locked.jdId]);
      const row: ManualGradingRow = {
        ...locked,
        finalScore: grade.finalScoreX100 / 100,
        manualGrading: grade.stored,
        gradedAt,
        rowVersion,
      };
      return { row, rubric: locked.rubric, card };
    });

    const session = await this.publicationOf(graded.row.sessionId);
    return { detail: this.detailOf(graded.row, graded.rubric, graded.card), session };
  }

  /**
   * AC-5: what the grade did to the session's results, through the one path that publishes them
   * (CONTEXT D53). Runs after the commit: a failure or a conflict leaves the grade as it is, and the
   * grading sweep tries again (LESSONS §34).
   */
  private async publicationOf(sessionId: number): Promise<ManualGradeResult['session']> {
    try {
      const remainingAnswers = await this.repository.countWaiting(sessionId);
      if (remainingAnswers > 0) return { remainingAnswers, publication: 'WAITING_OTHER_ANSWERS' };
      const outcome = await this.grading.finalizeIfReady(sessionId);
      const publication = publicationOf(outcome.kind);
      if (publication === 'NEXT_SWEEP') {
        this.logger.warn(`exam session ${sessionId}: results not published after a manual grade (${outcome.kind})`);
      }
      return publication === 'WAITING_OTHER_ANSWERS'
        ? { remainingAnswers: await this.repository.countWaiting(sessionId), publication }
        : { remainingAnswers: 0, publication };
    } catch (error) {
      this.logger.error(`exam session ${sessionId}: publishing after a manual grade failed: ${errorMessage(error)}`);
      return { remainingAnswers: 0, publication: 'NEXT_SWEEP' };
    }
  }

  private detailOf(row: ManualGradingRow, rubric: QuestionRubric, card: ShortlistJdCard | undefined): ManualGradingDetail {
    const manualGrade =
      row.manualGrading && row.finalScore !== null && row.gradedAt
        ? {
            criteria: row.manualGrading.criteria,
            note: row.manualGrading.note,
            finalScore: row.finalScore,
            gradedAt: row.gradedAt.toISOString(),
          }
        : null;
    return {
      answerId: row.answerId,
      sessionId: row.sessionId,
      rowVersion: row.rowVersion,
      jdTitle: card?.title ?? `JD #${row.jdId}`,
      companyName: card?.companyName ?? '',
      questionNo: questionNoOf(row.questionIds, row.questionId),
      skill: row.skill,
      stem: row.stem,
      rubric: rubric.map((criterion) => ({ criterion: criterion.criterion, maxPoints: criterion.max_points })),
      maxPoints: rubricPoints(rubric),
      sampleAnswer: row.sampleAnswer,
      answerText: 'text' in row.answer ? row.answer.text : '',
      reasons: row.reasons,
      aiPasses: aiPassesOf(row.aiGrading),
      manualGrade,
    };
  }
}
