import { Inject, Injectable } from '@nestjs/common';
import {
  type BankQuestion,
  type BankQuestionList,
  EXAM_PART_OF_TYPE,
  EXAM_PARTS,
  type ManualQuestionRejection,
  manualRejectReasonsFor,
  QUESTION_DIFFICULTIES,
  questionMachine,
  type QuestionStatus,
  type RejectQuestionRequest,
  type RejectQuestionResult,
  skillKey,
  USABLE_QUESTION_STATES,
} from '@srm/shared';
import type { AuthUser } from '../../../common/auth/index.js';
import { Clock } from '../../../common/clock/index.js';
import {
  EntityNotFoundError,
  QuestionGenerationRunningError,
  QuestionNotRejectableError,
  ValidationFailedError,
} from '../../../common/errors/index.js';
import { ADVISORY_LOCK_KEYS, lockEntityInTx } from '../../../common/scheduling/advisory-lock.js';
import { StateTransitionService } from '../../../common/state/index.js';
import { questionLifecycle } from '../../../db/lifecycles.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { userActor } from '../../audit/index.js';
import { CampaignService } from '../../campaign/index.js';
import { UserDirectory } from '../../iam/index.js';
import { QUESTION_BANK_ENTITY } from '../domain/audit-actions.js';
import { cellKeyOf, cellsOf, coverageOf } from '../domain/blueprint.js';
import { QuestionBanksRepository, type QuestionRecord } from '../infrastructure/question-banks.repository.js';
import { QuestionBankService } from './question-bank.service.js';

const isUsable = (status: QuestionStatus) => (USABLE_QUESTION_STATES as readonly QuestionStatus[]).includes(status);

/**
 * Every question of a JD's bank as CENTER reads it, and CENTER rejecting a wrong one by hand
 * (FR-18, US-4.11, CONTEXT D60): the human check that stands in for running the Validator on every
 * job. Before locking a rejected question is REJECTED: it leaves its cell's coverage, and the next
 * generation run writes another with the reason in its prompt (core.v_ai_question_rejections).
 * After locking it is retired through `retireQuestion()`, raising the bank's version (D50).
 */
@Injectable()
export class BankQuestionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly banks: QuestionBanksRepository,
    private readonly questionBanks: QuestionBankService,
    private readonly campaigns: CampaignService,
    private readonly users: UserDirectory,
    private readonly transitions: StateTransitionService,
    private readonly clock: Clock,
  ) {}

  /**
   * AC-1: `GET /api/question-banks/{id}/questions`, every question in every status, with its answer
   * key, rubric, AI check and rejection by hand. Read in one snapshot; part A first, then by cell of
   * the blueprint (cells it no longer has last), then the oldest question first.
   */
  async list(bankId: number): Promise<BankQuestionList> {
    const { bank, rows } = await this.db.transaction(
      async (tx) => {
        const found = await this.banks.findById(bankId, tx);
        if (!found) throw new EntityNotFoundError(QUESTION_BANK_ENTITY, bankId);
        return { bank: found, rows: await this.banks.allQuestions(bankId, tx) };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
    const rejecterIds = [...new Set(rows.flatMap((row) => (row.manualRejection ? [row.manualRejection.rejected_by] : [])))];
    const names = new Map(
      (await this.users.findContacts(rejecterIds)).map((user) => [user.id, user.fullName ?? user.email]),
    );
    const order = new Map(cellsOf(bank.blueprint).map((cell, index) => [cellKeyOf(cell.type, cell.skill, cell.difficulty), index]));
    const rank = (row: QuestionRecord) => order.get(cellKeyOf(row.type, row.skill, row.difficulty)) ?? order.size;
    // Cells the blueprint no longer has share one rank: by skill as cells match it, then by difficulty level.
    const sorted = [...rows].sort(
      (a, b) =>
        EXAM_PARTS.indexOf(EXAM_PART_OF_TYPE[a.type]) - EXAM_PARTS.indexOf(EXAM_PART_OF_TYPE[b.type]) ||
        rank(a) - rank(b) ||
        skillKey(a.skill).localeCompare(skillKey(b.skill)) ||
        QUESTION_DIFFICULTIES.indexOf(a.difficulty) - QUESTION_DIFFICULTIES.indexOf(b.difficulty) ||
        a.id - b.id,
    );
    return {
      bankId: bank.id,
      jdId: bank.jdId,
      status: bank.status,
      version: bank.version,
      questions: sorted.map((row) => bankQuestionView(row, rank(row) < order.size, names)),
    };
  }

  /**
   * AC-3: `POST /api/questions/{id}/reject`, 400 for a reason of the other question type
   * (`manualRejectReasonsFor`). Under the QUESTION_BANK lock of the JD (no run starts
   * meanwhile) and the bank's row lock (no lock, result or retirement meanwhile), 409 in this order:
   * the campaign is closed or cancelled, the question is no longer usable, a run is RUNNING, its
   * `rowVersion` is not the one CENTER saw. An open bank: REJECTED through `transitionTo` with the
   * rejection in the same UPDATE. A locked bank: `retireQuestion()`, its version rising by one.
   * Everything the response holds is read in the transaction (LESSONS §44).
   */
  async reject(user: AuthUser, questionId: number, body: RejectQuestionRequest): Promise<RejectQuestionResult> {
    const found = await this.banks.findQuestion(questionId);
    if (!found) throw new EntityNotFoundError(questionMachine.name, questionId);
    if (!manualRejectReasonsFor(found.type).includes(body.reason)) {
      throw new ValidationFailedError([{ path: 'reason', message: 'Lý do này không dùng cho loại câu này' }]);
    }
    const owner = await this.banks.findById(found.bankId);
    if (!owner) throw new EntityNotFoundError(QUESTION_BANK_ENTITY, found.bankId);
    const actor = userActor(user);
    const rejection: ManualQuestionRejection = {
      reason: body.reason,
      note: body.note || null,
      rejected_by: user.userId,
      rejected_at: this.clock.now().toISOString(),
    };
    const reason = `rejected by CENTER: ${body.reason}`;

    return this.db.transaction(async (tx) => {
      await this.campaigns.assertNotFinal(owner.campaignId, { tx });
      await lockEntityInTx(tx, ADVISORY_LOCK_KEYS.QUESTION_BANK, owner.jdId);
      const bank = await this.banks.lock(tx, owner.id);
      if (!bank) throw new EntityNotFoundError(QUESTION_BANK_ENTITY, owner.id);
      const question = await this.banks.findQuestion(questionId, tx);
      if (!question) throw new EntityNotFoundError(questionMachine.name, questionId);
      if (!isUsable(question.status)) throw new QuestionNotRejectableError(questionId, question.status);
      const running = await this.questionBanks.runningRun(tx, bank.id);
      if (running) throw new QuestionGenerationRunningError(bank.id, running.id);

      let result: Pick<RejectQuestionResult, 'status' | 'rowVersion'> & { bankVersion: number };
      if (bank.status === 'LOCKED') {
        const retired = await this.questionBanks.retireQuestion({
          questionId,
          actor,
          reason,
          expectedRowVersion: body.rowVersion,
          manualRejection: rejection,
          tx,
        });
        result = { status: 'RETIRED', rowVersion: retired.rowVersion, bankVersion: retired.bankVersion };
      } else {
        const moved = await this.transitions.transitionTo<QuestionStatus>({
          lifecycle: questionLifecycle,
          id: questionId,
          to: 'REJECTED',
          actor,
          reason,
          expectedRowVersion: body.rowVersion,
          set: { manualRejection: rejection },
          tx,
        });
        result = { status: 'REJECTED', rowVersion: moved.rowVersion, bankVersion: bank.version };
      }

      const [counts, reasons] = await Promise.all([
        this.banks.countQuestions(bank.id, tx),
        this.banks.countRejectReasons(bank.id, tx),
      ]);
      const key = cellKeyOf(question.type, question.skill, question.difficulty);
      const cell =
        coverageOf(bank.blueprint, counts, reasons).find((entry) => cellKeyOf(entry.type, entry.skill, entry.difficulty) === key) ??
        null;
      return {
        questionId,
        status: result.status,
        rowVersion: result.rowVersion,
        bank: { id: bank.id, status: bank.status, version: result.bankVersion },
        cell,
      };
    });
  }
}

function bankQuestionView(row: QuestionRecord, inBlueprint: boolean, names: ReadonlyMap<number, string>): BankQuestion {
  const { validation, manualRejection } = row;
  return {
    id: row.id,
    rowVersion: row.rowVersion,
    status: row.status,
    part: EXAM_PART_OF_TYPE[row.type],
    type: row.type,
    skill: row.skill,
    difficulty: row.difficulty,
    stem: row.content.stem,
    options: row.content.options,
    correctOption: row.answerKey.correct_option,
    explanation: row.answerKey.explanation,
    sampleAnswer: row.answerKey.sample_answer,
    rubric: row.rubric,
    inBlueprint,
    aiCheck: validation
      ? {
          status: validation.status,
          reasons: validation.reasons,
          correctOptions: validation.correct_options,
          estimatedDifficulty: validation.estimated_difficulty,
          note: validation.note,
          model: validation.model,
          promptVersion: validation.prompt_version,
        }
      : null,
    manualRejection: manualRejection
      ? {
          reason: manualRejection.reason,
          note: manualRejection.note,
          rejectedBy: { id: manualRejection.rejected_by, name: names.get(manualRejection.rejected_by) ?? `#${manualRejection.rejected_by}` },
          rejectedAt: manualRejection.rejected_at,
        }
      : null,
    model: row.model,
    promptVersion: row.promptVersion,
    createdAt: row.createdAt.toISOString(),
  };
}
