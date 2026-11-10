import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ExamBlueprint, toHundredths } from '@srm/shared';
import { Clock } from '../../../common/clock/index.js';
import { errorMessage, RowVersionConflictError } from '../../../common/errors/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { AuditService, SYSTEM_ACTOR } from '../../audit/index.js';
import { CampaignService, type CampaignSettings } from '../../campaign/index.js';
import { JdService } from '../../company/index.js';
import { UserDirectory } from '../../iam/index.js';
import { type GradingPreference, PreferenceGradingService } from '../../matching/index.js';
import { DEDUPE_KEYS, NotificationService, type PendingNotifications } from '../../notification/index.js';
import { ASSESSMENT_AUDIT_ACTIONS, EXAM_SESSION_ENTITY } from '../domain/audit-actions.js';
import { passOutcomes, rubricPoints, withGraderFlags } from '../domain/essay-pass.js';
import { decideNeedsHuman, type EssayToDecide } from '../domain/needs-human.js';
import {
  computeParts,
  computeSFinal,
  computeSkillScores,
  computeSTest,
  MCQ_POINTS,
  type PartWeights,
  type ScoredQuestion,
} from '../domain/scoring.js';
import { ExamGradingRepository, type PaperQuestionRow } from '../infrastructure/exam-grading.repository.js';
import { type ExamSessionRecord, ExamSessionsRepository } from '../infrastructure/exam-sessions.repository.js';
import { QuestionBanksRepository } from '../infrastructure/question-banks.repository.js';
import { McqGrader } from './mcq-grader.js';

/**
 * What `finalizeIfReady` did:
 * - PUBLISHED: the scores are written and the results published (with S_final when the preference
 *   was waiting for them);
 * - WAITING: a pass of the Grader is not in yet; NEEDS_HUMAN: an essay waits for a human grader
 *   (US-4.5), the preference stays PENDING_TEST; NOT_DUE: everything is graded, but the campaign
 *   is before `testing_end`, so nothing is published yet (the grading sweep does it after);
 * - NO_SCV: the preference's pair has no current S_cv; CONFLICT: a row changed meanwhile. Nothing
 *   was written; the grading sweep tries again;
 * - NOT_CLOSED, ALREADY_PUBLISHED, NOT_FOUND: nothing to do.
 */
export type FinalizeOutcome =
  | { kind: 'PUBLISHED'; sessionId: number; sTestX100: number; preferenceId: number | null; sFinalX100: number | null }
  | {
      kind: 'WAITING' | 'NEEDS_HUMAN' | 'NOT_DUE' | 'NO_SCV' | 'CONFLICT' | 'NOT_CLOSED' | 'ALREADY_PUBLISHED' | 'NOT_FOUND';
    };

/** Thrown inside the transaction to roll it back when S_cv is missing. */
class MissingScvError extends Error {}

/**
 * Grading of a closed session (FR-22, US-4.4 AC-6, AC-8–AC-11, CONTEXT D53): code decides which
 * essays go to a human grader, computes S_test, the parts, the skill map and S_final, and publishes
 * the results. Exported for US-4.5 (after a human grade) and US-4.6 (after an appeal).
 */
@Injectable()
export class GradingService {
  private readonly logger = new Logger(GradingService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly clock: Clock,
    private readonly sessions: ExamSessionsRepository,
    private readonly grading: ExamGradingRepository,
    private readonly banks: QuestionBanksRepository,
    private readonly mcq: McqGrader,
    private readonly preferences: PreferenceGradingService,
    private readonly campaigns: CampaignService,
    private readonly jds: JdService,
    private readonly directory: UserDirectory,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  /**
   * AC-11: in one transaction, under the session's row lock:
   * 1. grades the MCQs not graded yet; stops while an essay waits for a pass or a human grader;
   * 2. `decideNeedsHuman` over the essays with both passes: writes their final score or their
   *    handoff, and the Grader's flags; a handoff keeps the preference PENDING_TEST;
   * 3. before the campaign's `testing_end`, stops there: a published result, the Grader's reasons
   *    above all, would tell students who have not taken the same essays yet what it looks for;
   * 4. computes S_test, the parts and the skill scores;
   * 5. locks the preference, reads its S_cv `FOR SHARE`, computes S_final and moves it
   *    PENDING_TEST → TEST_GRADED with both;
   * 6. writes the scores with `results_published_at` and notifies the student.
   * A row version that changed, or a missing S_cv, rolls everything back.
   */
  async finalizeIfReady(sessionId: number): Promise<FinalizeOutcome> {
    const found = await this.sessions.findById(sessionId);
    if (!found) return { kind: 'NOT_FOUND' };
    if (found.status === 'IN_PROGRESS') return { kind: 'NOT_CLOSED' };
    if (found.resultsPublishedAt !== null) return { kind: 'ALREADY_PUBLISHED' };
    const bank = await this.banks.findById(found.bankId);
    if (!bank) throw new Error(`exam session ${sessionId}: question bank ${found.bankId} not found`);
    const campaign = await this.campaigns.getSettings(bank.campaignId);
    const context: FinalizeContext = {
      campaign,
      jdId: bank.jdId,
      weights: partWeightsOf(bank.blueprint),
      due: isPastTestingEnd(campaign, this.clock.now()),
    };

    let pending: PendingNotifications | null = null;
    let outcome: FinalizeOutcome;
    try {
      outcome = await this.db.transaction(async (tx) => {
        const result = await this.finalizeInTx(tx, sessionId, context);
        pending = result.pending;
        return result.outcome;
      });
    } catch (error) {
      if (error instanceof MissingScvError) {
        this.logger.warn(`exam session ${sessionId}: no current S_cv for its preference; results not published`);
        return { kind: 'NO_SCV' };
      }
      if (error instanceof RowVersionConflictError) {
        this.logger.log(`exam session ${sessionId}: ${errorMessage(error)}; the grading sweep tries again`);
        return { kind: 'CONFLICT' };
      }
      throw error;
    }
    if (pending) await this.notifications.push(pending);
    return outcome;
  }

  private async finalizeInTx(
    tx: DbTx,
    sessionId: number,
    context: FinalizeContext,
  ): Promise<{ outcome: FinalizeOutcome; pending: PendingNotifications | null }> {
    const quiet = (kind: Exclude<FinalizeOutcome['kind'], 'PUBLISHED'>) => ({ outcome: { kind } as FinalizeOutcome, pending: null });
    const session = await this.sessions.lock(tx, sessionId);
    if (!session) return quiet('NOT_FOUND');
    if (session.status === 'IN_PROGRESS') return quiet('NOT_CLOSED');
    if (session.resultsPublishedAt !== null) return quiet('ALREADY_PUBLISHED');

    await this.mcq.gradeInTx(tx, sessionId);
    const questions = await this.grading.paperQuestions(session.questionIds, tx);
    const answers = await this.grading.answersOf(sessionId, tx);
    const paper = paperOf(session, questions);
    const essays = answers.filter((answer) => answer.type === 'ESSAY');
    if (essays.some((answer) => answer.finalScore === null && answer.needsHuman)) return quiet('NEEDS_HUMAN');

    const maxPointsOf = new Map(paper.map((question) => [question.questionId, question.maxPoints]));
    const settled = new Map(
      answers.flatMap((answer) => (answer.finalScore === null ? [] : [[answer.questionId, toHundredths(answer.finalScore)] as const])),
    );
    const undecided = essays.filter((answer) => answer.finalScore === null);
    const decision = decideNeedsHuman({
      paper,
      weights: context.weights,
      settled,
      essays: undecided.map((answer): EssayToDecide => ({
        questionId: answer.questionId,
        maxPoints: maxPointsOf.get(answer.questionId)!,
        passes: passOutcomes(answer.aiGrading),
      })),
      thetaTestX100: toHundredths(context.campaign.config.theta_test),
    });
    if (decision.kind === 'WAITING') return quiet('WAITING');

    await this.grading.writeEssayScores(tx, sessionId, decision.scores);
    await this.grading.writeHandoffs(tx, sessionId, decision.handoffs);
    let rowVersion = session.rowVersion;
    const flags = withGraderFlags(
      session.flags,
      undecided.map((answer) => ({ questionId: answer.questionId, grading: answer.aiGrading })),
    );
    if (flags) rowVersion = await this.grading.writeFlags(tx, sessionId, rowVersion, flags);
    if (decision.handoffs.length > 0) return quiet('NEEDS_HUMAN');
    if (!context.due) return quiet('NOT_DUE');

    const scores = new Map(settled);
    for (const { questionId, finalScoreX100 } of decision.scores) scores.set(questionId, finalScoreX100);
    const sTestX100 = computeSTest(paper, context.weights, scores);
    const parts = computeParts(paper, scores);
    const skillScores = computeSkillScores(paper, context.weights, scores);

    const preference = await this.preferences.lockForGrading(session.studentId, context.jdId, { tx });
    const sFinalX100 = await this.moveToTestGraded(tx, session, preference, sTestX100, context.campaign);
    const publishedAt = this.clock.now();
    await this.grading.publish(tx, sessionId, rowVersion, {
      ...parts,
      sTestX100,
      skillScores,
      publishedAt,
    });
    await this.audit.record(tx, {
      actor: SYSTEM_ACTOR,
      action: ASSESSMENT_AUDIT_ACTIONS.EXAM_RESULTS_PUBLISHED,
      entity: EXAM_SESSION_ENTITY,
      entityId: sessionId,
      after: {
        scoreA: parts.scoreAX100 / 100,
        scoreB: parts.scoreBX100 / 100,
        sTest: sTestX100 / 100,
        preferenceId: preference?.id ?? null,
        sFinal: sFinalX100 === null ? null : sFinalX100 / 100,
      },
    });
    const pending = preference ? await this.notifyPublished(tx, session, preference, context) : null;
    return {
      outcome: { kind: 'PUBLISHED', sessionId, sTestX100, preferenceId: preference?.id ?? null, sFinalX100 },
      pending,
    };
  }

  /**
   * AC-10: S_final of a preference still waiting for its test, from its S_cv, both stored; null for
   * a preference that moved on meanwhile (e.g. withdrawn), whose session is still published.
   */
  private async moveToTestGraded(
    tx: DbTx,
    session: ExamSessionRecord,
    preference: GradingPreference | undefined,
    sTestX100: number,
    campaign: CampaignSettings,
  ): Promise<number | null> {
    if (!preference || preference.status !== 'PENDING_TEST') {
      this.logger.warn(
        `exam session ${session.id}: preference ${preference?.id ?? '?'} is ${preference?.status ?? 'missing'}; no S_final`,
      );
      return null;
    }
    const scvX100 = await this.preferences.currentScvX100(preference, { tx });
    if (scvX100 === null) throw new MissingScvError();
    const sFinalX100 = computeSFinal(scvX100, sTestX100, {
      alphaX100: toHundredths(campaign.config.alpha),
      betaX100: toHundredths(campaign.config.beta),
    });
    await this.preferences.markTestGraded(preference.id, preference.rowVersion, { sCvX100: scvX100, sFinalX100 }, { tx });
    return sFinalX100;
  }

  /** AC-11: `EXAM_RESULT_PUBLISHED` to the student, IN_APP and EMAIL, once per session. */
  private async notifyPublished(
    tx: DbTx,
    session: ExamSessionRecord,
    preference: GradingPreference,
    context: FinalizeContext,
  ): Promise<PendingNotifications | null> {
    const [userIds, [card]] = await Promise.all([
      this.directory.userIdsByStudent([session.studentId]),
      this.jds.listCardsByIds([context.jdId]),
    ]);
    const recipients = userIds.get(session.studentId) ?? [];
    if (recipients.length === 0) return null;
    return this.notifications.notify(
      {
        type: 'EXAM_RESULT_PUBLISHED',
        payload: {
          campaignId: context.campaign.id,
          campaignName: context.campaign.name,
          sessionId: session.id,
          preferenceId: preference.id,
          rank: preference.rank,
          jdTitle: card?.title ?? `JD #${context.jdId}`,
          companyName: card?.companyName || '—',
        },
        userIds: recipients,
        channels: ['IN_APP', 'EMAIL'],
        dedupeKey: DEDUPE_KEYS.examResultPublished(session.id),
      },
      { tx },
    );
  }
}

interface FinalizeContext {
  campaign: CampaignSettings;
  jdId: number;
  weights: PartWeights;
  /** The campaign is past `testing_end`: results may be published. */
  due: boolean;
}

/**
 * Whether the campaign's test window is over (CONTEXT D53): its essays may be sent by the sweep and
 * its results published. A campaign without `testing_end` never is.
 */
export function isPastTestingEnd(campaign: Pick<CampaignSettings, 'phaseDeadlines'>, now: Date): boolean {
  const testingEnd = campaign.phaseDeadlines.testing_end;
  return testingEnd !== undefined && Date.parse(testingEnd) <= now.getTime();
}

/** `weight_percent` of each part of the bank's blueprint. */
export function partWeightsOf(blueprint: ExamBlueprint): PartWeights {
  return { A: blueprint.parts.A.weight_percent, B: blueprint.parts.B.weight_percent };
}

/** The paper in draw order, each question with the points it is worth. */
export function paperOf(session: Pick<ExamSessionRecord, 'id' | 'questionIds'>, rows: readonly PaperQuestionRow[]): ScoredQuestion[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return session.questionIds.map((questionId): ScoredQuestion => {
    const row = byId.get(questionId);
    if (!row) throw new Error(`exam session ${session.id}: question ${questionId} not found`);
    if (row.type === 'ESSAY' && !row.rubric) throw new Error(`exam session ${session.id}: essay ${questionId} has no rubric`);
    return {
      questionId,
      type: row.type,
      skill: row.skill,
      maxPoints: row.type === 'ESSAY' ? rubricPoints(row.rubric!) : MCQ_POINTS,
    };
  });
}
