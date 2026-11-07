import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  type JdRequirements,
  jobDescriptionMachine,
  QUESTION_BANK_JD_STATES,
  type QuestionBankStatus,
  type QuestionGenerationRun,
  questionMachine,
  type QuestionStatus,
} from '@srm/shared';
import { randomUUID } from 'node:crypto';
import { Clock } from '../../../common/clock/index.js';
import {
  AiUnavailableError,
  BankNotLockedError,
  EntityNotFoundError,
  errorMessage,
  JdNotApprovedError,
  QuestionBankIncompleteError,
  QuestionBankJdOutdatedError,
  QuestionBankLockedError,
  QuestionGenerationRunningError,
  RowVersionConflictError,
} from '../../../common/errors/index.js';
import { ADVISORY_LOCK_KEYS, lockEntityInTx } from '../../../common/scheduling/advisory-lock.js';
import { StateTransitionService } from '../../../common/state/index.js';
import { questionBankLifecycle, questionLifecycle } from '../../../db/lifecycles.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { AiGatewayService } from '../../aigateway/index.js';
import { type Actor, AuditService, SYSTEM_ACTOR } from '../../audit/index.js';
import { CampaignService } from '../../campaign/index.js';
import { JD_APPROVED, type JdEvent, JdService } from '../../company/index.js';
import { ASSESSMENT_AUDIT_ACTIONS, QUESTION_BANK_ENTITY } from '../domain/audit-actions.js';
import { blueprintCellFilter, buildDefaultBlueprint, coverageOf } from '../domain/blueprint.js';
import type { DrawableBank, RetiredQuestion } from '../domain/drawable-bank.js';
import { lockBlockers, missingCellsOf } from '../domain/lock-readiness.js';
import { type QuestionBankRecord, QuestionBanksRepository } from '../infrastructure/question-banks.repository.js';
import {
  type QuestionGenerationRunRecord,
  QuestionGenerationRunsRepository,
} from '../infrastructure/question-generation-runs.repository.js';
import { runView } from './views.js';

const HOUR_MS = 3_600_000;

/**
 * A run still without its result after this long is closed. A job runs at most MAX_ROUNDS LLM
 * calls one after the other (ai-service test_generator/config.py, CONTEXT D49): minutes, not hours.
 */
const STALE_AFTER_MS = 24 * HOUR_MS;

/** A run the API never handed to the broker (it stopped between commit and dispatch). */
const UNDISPATCHED_AFTER_MS = HOUR_MS / 4;

/** A JD that may have a question bank, with the requirements its blueprint names skills of. */
export interface BankJd {
  jdId: number;
  campaignId: number;
  jdVersion: number;
  requirements: JdRequirements;
}

interface Planned {
  run: QuestionGenerationRunRecord;
  /** A new run whose job still has to be sent; false for the run already RUNNING. */
  send: boolean;
}

/**
 * The question bank of each approved JD and its generation runs (FR-18, US-4.1 AC-3, AC-4,
 * CONTEXT D49). The bank is made with the default blueprint when the JD is approved, and its first
 * `ai.questions.generate` job is sent then; CENTER starts later runs ("Sinh câu còn thiếu"), which
 * also repairs a missed `jd.approved` (LESSONS §34). Every change to a JD's bank holds the
 * QUESTION_BANK lock of the JD, and the job id is stored before the job is sent (LESSONS §33).
 */
@Injectable()
export class QuestionBankService {
  private readonly logger = new Logger(QuestionBankService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jds: JdService,
    private readonly campaigns: CampaignService,
    private readonly banks: QuestionBanksRepository,
    private readonly runs: QuestionGenerationRunsRepository,
    private readonly audit: AuditService,
    private readonly aiGateway: AiGatewayService,
    private readonly clock: Clock,
    private readonly transitions: StateTransitionService,
  ) {}

  /**
   * AC-4: the JD's bank and its first job. A duplicate event finds a run and sends nothing; a bank
   * the blueprint screen made first (it reads the bank as soon as the JD shows approved) still gets
   * its first job. The JD change has committed; a failure here is logged, and CENTER can start
   * the job by hand.
   */
  @OnEvent(JD_APPROVED, { async: true })
  async onJdApproved(event: JdEvent): Promise<void> {
    try {
      await this.start(event.jdId, SYSTEM_ACTOR, { onlyFirstRun: true });
    } catch (error) {
      this.logger.error(`JD ${event.jdId}: question bank not started: ${errorMessage(error)}`);
    }
  }

  /**
   * AC-3, AC-4: `POST /api/jds/{id}/question-bank/generate`. While a run is RUNNING it is returned
   * and no job is sent. A job the broker refuses fails the run: 503.
   */
  async generate(jdId: number, actor: Actor): Promise<QuestionGenerationRun> {
    const run = await this.start(jdId, actor, { onlyFirstRun: false });
    if (run === null) throw new Error(`JD ${jdId}: generation run not started`);
    return run;
  }

  /**
   * The JD if it may have a bank: 404 without such a JD, 409 before it is approved (BR-02). With
   * `tx`, its row stays share-locked until the transaction ends.
   */
  async requireBankJd(jdId: number, options: { tx?: DbTx } = {}): Promise<BankJd> {
    const jd = await this.jds.getForQuestionBank(jdId, options);
    if (!jd) throw new EntityNotFoundError(jobDescriptionMachine.name, jdId);
    if (!QUESTION_BANK_JD_STATES.includes(jd.status) || jd.requirements === null) throw new JdNotApprovedError(jdId, jd.status);
    return { jdId: jd.jdId, campaignId: jd.campaignId, jdVersion: jd.jdVersion, requirements: jd.requirements };
  }

  /**
   * Takes the QUESTION_BANK lock of the JD, then returns its bank, made with the default blueprint
   * (AC-1) when it has none yet: the bank of a JD whose `jd.approved` was missed comes on first use.
   */
  async lockBank(tx: DbTx, jd: BankJd, actor: Actor): Promise<QuestionBankRecord> {
    await lockEntityInTx(tx, ADVISORY_LOCK_KEYS.QUESTION_BANK, jd.jdId);
    const existing = await this.banks.findByJd(jd.jdId, tx);
    if (existing) return existing;
    const campaign = await this.campaigns.getSettings(jd.campaignId);
    const blueprint = buildDefaultBlueprint(jd.requirements, { durationMinutes: campaign.config.t_test_minutes });
    const bank = await this.banks.insert(tx, {
      campaignId: jd.campaignId,
      jdId: jd.jdId,
      jdVersion: jd.jdVersion,
      blueprint,
    });
    await this.audit.record(tx, {
      actor,
      action: ASSESSMENT_AUDIT_ACTIONS.QUESTION_BANK_CREATED,
      entity: QUESTION_BANK_ENTITY,
      entityId: bank.id,
      after: { jdId: jd.jdId, jdVersion: jd.jdVersion, blueprint },
    });
    return bank;
  }

  /** The bank's RUNNING run, once a run whose result can no longer come is closed as STALE. */
  async runningRun(tx: DbTx, bankId: number): Promise<QuestionGenerationRunRecord | undefined> {
    const now = this.clock.now().getTime();
    await this.runs.closeStale(tx, bankId, new Date(now - STALE_AFTER_MS), new Date(now - UNDISPATCHED_AFTER_MS));
    return this.runs.findRunning(tx, bankId);
  }

  /** A RUNNING run that `runningRun` would close as STALE now (the same bounds as `closeStale`). */
  isOverdue(run: QuestionGenerationRunRecord): boolean {
    const now = this.clock.now().getTime();
    const created = run.createdAt.getTime();
    return (
      run.status === 'RUNNING' &&
      (created < now - STALE_AFTER_MS || (run.dispatchedAt === null && created < now - UNDISPATCHED_AFTER_MS))
    );
  }

  /**
   * US-4.2 AC-6: CENTER locks the bank, `OPEN → LOCKED` with `locked_at` in the same UPDATE. Under
   * the QUESTION_BANK lock of the JD and the bank's row lock (so no result or retirement changes
   * the count meanwhile), 409 in this order: `rowVersion` not the stored one, already LOCKED, a
   * generation RUNNING, the JD's requirements newer than the blueprint, a cell short of VALIDATED
   * questions (with the cells). The JD's version is read in the transaction, share-locked: a save
   * of new requirements either comes first and is seen, or waits for the lock (AC-11). Returns the
   * bank's JD.
   */
  async lock(bankId: number, actor: Actor, rowVersion: number): Promise<{ jdId: number }> {
    const found = await this.banks.findById(bankId);
    if (!found) throw new EntityNotFoundError(QUESTION_BANK_ENTITY, bankId);
    const { jdId } = await this.requireBankJd(found.jdId);
    await this.db.transaction(async (tx) => {
      await lockEntityInTx(tx, ADVISORY_LOCK_KEYS.QUESTION_BANK, jdId);
      const bank = await this.banks.lock(tx, bankId);
      if (!bank) throw new EntityNotFoundError(QUESTION_BANK_ENTITY, bankId);
      if (bank.rowVersion !== rowVersion) {
        throw new RowVersionConflictError(QUESTION_BANK_ENTITY, bankId, rowVersion, bank.rowVersion);
      }
      const jd = await this.requireBankJd(jdId, { tx });
      const running = await this.runningRun(tx, bankId);
      const coverage = coverageOf(bank.blueprint, await this.banks.countQuestions(bankId, tx));
      const [blocker] = lockBlockers({
        status: bank.status,
        generationRunning: running !== undefined,
        jdOutdated: bank.jdVersion < jd.jdVersion,
        coverage,
      });
      if (blocker === 'LOCKED') throw new QuestionBankLockedError(bankId);
      if (blocker === 'GENERATION_RUNNING' && running) throw new QuestionGenerationRunningError(bankId, running.id);
      if (blocker === 'JD_OUTDATED') throw new QuestionBankJdOutdatedError(bankId, bank.jdVersion, jd.jdVersion);
      if (blocker !== undefined) throw new QuestionBankIncompleteError(bankId, missingCellsOf(coverage));
      await this.transitions.transitionTo<QuestionBankStatus>({
        lifecycle: questionBankLifecycle,
        id: bankId,
        to: 'LOCKED',
        actor,
        reason: 'question bank locked: every cell holds 3× validated questions',
        expectedRowVersion: rowVersion,
        set: { lockedAt: this.clock.now() },
        tx,
      });
    });
    return { jdId };
  }

  /**
   * US-4.2 AC-7: `VALIDATED → RETIRED` (US-4.6, US-4.9 add the endpoints). In a locked bank the
   * bank's `version` rises by one and `QUESTION_BANK_VERSIONED` is written in the same transaction;
   * an OPEN bank keeps its version. The bank's row lock orders this with `lock` and with results.
   */
  async retireQuestion(request: {
    questionId: number;
    actor: Actor;
    reason: string;
    /** Required for a USER actor, as for every `transitionTo`. */
    expectedRowVersion?: number;
  }): Promise<RetiredQuestion> {
    const { questionId, actor, reason } = request;
    return this.db.transaction(async (tx) => {
      const question = await this.banks.findQuestion(questionId, tx);
      if (!question) throw new EntityNotFoundError(questionMachine.name, questionId);
      const bank = await this.banks.lock(tx, question.bankId);
      if (!bank) throw new EntityNotFoundError(QUESTION_BANK_ENTITY, question.bankId);
      const moved = await this.transitions.transitionTo<QuestionStatus>({
        lifecycle: questionLifecycle,
        id: questionId,
        to: 'RETIRED',
        actor,
        reason,
        ...(request.expectedRowVersion === undefined ? {} : { expectedRowVersion: request.expectedRowVersion }),
        tx,
      });
      if (bank.status !== 'LOCKED') {
        return { questionId, rowVersion: moved.rowVersion, bankId: bank.id, bankVersion: bank.version };
      }
      const { version } = await this.banks.bumpVersion(tx, bank);
      await this.audit.record(tx, {
        actor,
        action: ASSESSMENT_AUDIT_ACTIONS.QUESTION_BANK_VERSIONED,
        entity: QUESTION_BANK_ENTITY,
        entityId: bank.id,
        before: { version: bank.version },
        after: { version, questionId },
        reason,
      });
      return { questionId, rowVersion: moved.rowVersion, bankId: bank.id, bankVersion: version };
    });
  }

  /**
   * US-4.2 AC-8: what an exam of the bank is drawn from (US-4.3), read in one snapshot so the
   * version matches the questions. Only a LOCKED bank: 409 BANK_NOT_LOCKED otherwise. Only the
   * VALIDATED questions of the blueprint's cells: those of a skill the JD dropped stay out (AC-11).
   * The answer keys are for the server; they are never sent to a student (AGENTS › Invariant 8).
   */
  async getDrawableQuestions(bankId: number): Promise<DrawableBank> {
    return this.db.transaction(
      async (tx) => {
        const bank = await this.banks.findById(bankId, tx);
        if (!bank) throw new EntityNotFoundError(QUESTION_BANK_ENTITY, bankId);
        if (bank.status !== 'LOCKED') throw new BankNotLockedError(bankId);
        const inBlueprint = blueprintCellFilter(bank.blueprint);
        const questions = (await this.banks.validatedQuestions(bankId, tx)).filter(inBlueprint);
        return {
          bankId,
          version: bank.version,
          blueprint: bank.blueprint,
          questions: questions.map((question) => ({
            id: question.id,
            type: question.type,
            skill: question.skill,
            difficulty: question.difficulty,
            content: question.content,
            answerKey: question.answerKey,
            rubric: question.rubric,
          })),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  private async start(
    jdId: number,
    actor: Actor,
    { onlyFirstRun }: { onlyFirstRun: boolean },
  ): Promise<QuestionGenerationRun | null> {
    const jd = await this.requireBankJd(jdId);
    const planned = await this.db.transaction(async (tx): Promise<Planned | null> => {
      const bank = await this.lockBank(tx, jd, actor);
      if (onlyFirstRun && (await this.runs.exists(tx, bank.id))) return null;
      if (bank.status === 'LOCKED') throw new QuestionBankLockedError(bank.id);
      // US-4.2 AC-11: cells for skills the JD may have dropped are not filled; the blueprint is
      // saved again against the new requirements first.
      if (bank.jdVersion < jd.jdVersion) throw new QuestionBankJdOutdatedError(bank.id, bank.jdVersion, jd.jdVersion);
      const running = await this.runningRun(tx, bank.id);
      if (running) return { run: running, send: false };
      const run = await this.runs.insertRunning(tx, bank.id, randomUUID(), actor);
      await this.audit.record(tx, {
        actor,
        action: ASSESSMENT_AUDIT_ACTIONS.QUESTION_GENERATION_STARTED,
        entity: QUESTION_BANK_ENTITY,
        entityId: bank.id,
        after: { runId: run.id, jobId: run.jobId },
      });
      return { run, send: true };
    });
    if (planned === null) return null;
    if (planned.send) await this.dispatch(jdId, planned.run);
    return runView(planned.run);
  }

  /** After commit, with the job id the run already holds (AD-5, LESSONS §33). */
  private async dispatch(jdId: number, run: QuestionGenerationRunRecord): Promise<void> {
    try {
      await this.aiGateway.dispatch('QUESTIONS_GENERATE', { bank_id: run.bankId }, run.jobId);
    } catch (error) {
      this.logger.error(`JD ${jdId}: generation run ${run.id} not dispatched: ${errorMessage(error)}`);
      await this.runs.fail(run.id, 'DISPATCH_FAILED');
      throw new AiUnavailableError('QUESTIONS_GENERATE');
    }
    // The job is on its way, so a failure here is no reason to answer 503. Left unmarked, the run
    // is closed as STALE by the next one after UNDISPATCHED_AFTER_MS.
    await this.runs.markDispatched(run.id).catch((error: unknown) => {
      this.logger.warn(`JD ${jdId}: generation run ${run.id} sent, not marked so: ${errorMessage(error)}`);
    });
  }
}
