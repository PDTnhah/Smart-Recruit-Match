import { Inject, Injectable } from '@nestjs/common';
import {
  QUESTION_BANK_JD_STATES,
  questionMachine,
  type QuestionReviewSample,
  type QuestionStatus,
  type SampleQuestion,
  type SubmitQuestionReviewRequest,
  USABLE_QUESTION_STATES,
} from '@srm/shared';
import type { AuthUser } from '../../../common/auth/index.js';
import { Clock } from '../../../common/clock/index.js';
import {
  JdNotApprovedError,
  QuestionNotReviewableError,
  ValidationFailedError,
} from '../../../common/errors/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { AuditService, userActor } from '../../audit/index.js';
import { CampaignService } from '../../campaign/index.js';
import { JdService } from '../../company/index.js';
import { ASSESSMENT_AUDIT_ACTIONS } from '../domain/audit-actions.js';
import { drawReviewSample, type SampledQuestion } from '../domain/review-sample.js';
import {
  type QuestionBankRecord,
  QuestionBanksRepository,
  type QuestionRecord,
} from '../infrastructure/question-banks.repository.js';
import { type QuestionReviewRecord, QuestionReviewsRepository } from '../infrastructure/question-reviews.repository.js';
import { QuestionBankService } from './question-bank.service.js';

const isUsable = (status: QuestionStatus) => (USABLE_QUESTION_STATES as readonly QuestionStatus[]).includes(status);

/**
 * Sample review of a JD's question bank (FR-19, UC-22, US-4.9, PRD GĐ5 › Quy trình sinh đề bước 3).
 * HR of the JD's company or CENTER (lecturers review with a CENTER account) read a random sample,
 * stratified by blueprint cell, with answer keys and rubrics, and mark each question OK or ERROR. An
 * ERROR retires the question in the same transaction (a locked bank's version rises). Optional:
 * locking and the exam room never wait for a review (AC-5).
 *
 * The sample is drawn with the bank's id as seed from the usable questions and those already
 * reviewed, so a reload shows the same questions and a question reported wrong keeps its place.
 * Reviewed questions stay in it even when CENTER lowers `bank_review_sample_size` afterwards.
 */
@Injectable()
export class ReviewSampleService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jds: JdService,
    private readonly campaigns: CampaignService,
    private readonly banks: QuestionBanksRepository,
    private readonly reviews: QuestionReviewsRepository,
    private readonly questionBanks: QuestionBankService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /**
   * AC-1, AC-2: `GET /api/jds/{id}/question-bank/sample`. A JD of another company answers 404 like a
   * missing one (BR-11); one not approved yet 409. No bank yet: `bank` null and no question (the
   * screen's empty state); reading never makes the bank.
   */
  async get(user: AuthUser, jdId: number): Promise<QuestionReviewSample> {
    const { campaignId } = await this.requireReviewableJd(user, jdId);
    const { config } = await this.campaigns.getSettings(campaignId);
    return this.db.transaction(
      async (tx) => {
        const bank = await this.banks.findByJd(jdId, tx);
        const sampleSize = config.bank_review_sample_size;
        if (!bank) return { jdId, bank: null, sampleSize, questions: [] };
        const { sample, latest } = await this.sampleOf(tx, bank, sampleSize);
        return {
          jdId,
          bank: { id: bank.id, status: bank.status, version: bank.version },
          sampleSize,
          questions: sample.map(({ part, question }) => sampleQuestionView(part, question, latest.get(question.id), user)),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  /**
   * AC-3, AC-4: `POST /api/jds/{id}/question-bank/sample/reviews`. Under the bank's row lock, so the
   * sample is the one the bank holds now: a question outside it 400, one retired or rejected since
   * 409. The review and its audit entry are written; an ERROR then retires the question with the
   * `rowVersion` the reviewer saw (409 when it changed). Closed or cancelled campaign: 409.
   */
  async review(user: AuthUser, jdId: number, body: SubmitQuestionReviewRequest): Promise<QuestionReviewSample> {
    const { campaignId } = await this.requireReviewableJd(user, jdId);
    await this.db.transaction(async (tx) => {
      const { config } = await this.campaigns.assertNotFinal(campaignId, { tx });
      const found = await this.banks.findByJd(jdId, tx);
      const bank = found && (await this.banks.lock(tx, found.id));
      const { sample } = bank ? await this.sampleOf(tx, bank, config.bank_review_sample_size) : { sample: [] };
      const question = sample.find((entry) => entry.question.id === body.questionId)?.question;
      if (!bank || !question) {
        // A sampled question rejected or retired before anyone reviewed it left the sample: 409 as when it is
        // still shown, so the reviewer reloads instead of reading "not in the sample".
        const stored = bank ? await this.banks.findQuestion(body.questionId, tx) : undefined;
        if (stored && stored.bankId === bank?.id && !isUsable(stored.status)) {
          throw new QuestionNotReviewableError(stored.id, stored.status);
        }
        throw new ValidationFailedError([{ path: 'questionId', message: 'Câu này không thuộc mẫu duyệt của JD' }]);
      }
      if (!isUsable(question.status)) throw new QuestionNotReviewableError(question.id, question.status);

      const actor = userActor(user);
      const reason = body.verdict === 'ERROR' ? (body.reason ?? null) : null;
      const review = await this.reviews.insert(tx, {
        questionId: question.id,
        bankVersion: bank.version,
        reviewerId: user.userId,
        verdict: body.verdict,
        reason,
        reviewedAt: this.clock.now(),
      });
      await this.audit.record(tx, {
        actor,
        action: ASSESSMENT_AUDIT_ACTIONS.QUESTION_REVIEWED,
        entity: questionMachine.name,
        entityId: question.id,
        after: { reviewId: review.id, bankId: bank.id, bankVersion: bank.version, verdict: body.verdict, reason },
      });
      if (body.verdict === 'ERROR') {
        await this.questionBanks.retireQuestion({
          questionId: question.id,
          actor,
          reason: `sample review: ${reason ?? ''}`,
          ...(body.rowVersion === undefined ? {} : { expectedRowVersion: body.rowVersion }),
          tx,
        });
      }
    });
    return this.get(user, jdId);
  }

  /** The JD if the caller may review its bank: 404 outside the caller's scope, 409 before approval. */
  private async requireReviewableJd(user: AuthUser, jdId: number): Promise<{ campaignId: number }> {
    const jd = await this.jds.get(user, jdId);
    if (!QUESTION_BANK_JD_STATES.includes(jd.status)) throw new JdNotApprovedError(jdId, jd.status);
    return { campaignId: jd.campaignId };
  }

  /** The sample and the latest review of each candidate; reviewed questions stay in it whatever the size. */
  private async sampleOf(
    tx: DbTx,
    bank: QuestionBankRecord,
    size: number,
  ): Promise<{ sample: SampledQuestion<QuestionRecord>[]; latest: Map<number, QuestionReviewRecord> }> {
    const candidates = await this.banks.reviewCandidates(bank.id, tx);
    const latest = await this.reviews.latestOf(
      candidates.map((question) => question.id),
      tx,
    );
    const keep = new Set(latest.keys());
    return { sample: drawReviewSample({ candidates, blueprint: bank.blueprint, size, seed: bank.id, keep }), latest };
  }
}

function sampleQuestionView(
  part: SampleQuestion['part'],
  question: QuestionRecord,
  review: QuestionReviewRecord | undefined,
  user: AuthUser,
): SampleQuestion {
  return {
    id: question.id,
    rowVersion: question.rowVersion,
    status: question.status,
    part,
    type: question.type,
    skill: question.skill,
    difficulty: question.difficulty,
    stem: question.content.stem,
    options: question.content.options,
    correctOption: question.answerKey.correct_option,
    explanation: question.answerKey.explanation,
    sampleAnswer: question.answerKey.sample_answer,
    rubric: question.rubric,
    review: review
      ? {
          verdict: review.verdict,
          reason: review.reason,
          reviewedAt: review.reviewedAt.toISOString(),
          mine: review.reviewerId === user.userId,
        }
      : null,
  };
}
