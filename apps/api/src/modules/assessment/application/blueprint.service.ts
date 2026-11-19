import { Inject, Injectable } from '@nestjs/common';
import {
  type CvVerificationSettings,
  type ExamBlueprintView,
  examBlueprintRequestSchema,
  type LockQuestionBankRequest,
  type UpdateExamBlueprintRequest,
} from '@srm/shared';
import type { AuthUser } from '../../../common/auth/index.js';
import {
  QuestionBankLockedError,
  QuestionGenerationRunningError,
  RowVersionConflictError,
} from '../../../common/errors/index.js';
import { parseOrFail } from '../../../common/validation/validation-issues.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { AuditService, SYSTEM_ACTOR, userActor } from '../../audit/index.js';
import { ASSESSMENT_AUDIT_ACTIONS, QUESTION_BANK_ENTITY } from '../domain/audit-actions.js';
import { coverageOf } from '../domain/blueprint.js';
import { lockBlockers } from '../domain/lock-readiness.js';
import { type QuestionBankRecord, QuestionBanksRepository } from '../infrastructure/question-banks.repository.js';
import {
  type QuestionGenerationRunRecord,
  QuestionGenerationRunsRepository,
} from '../infrastructure/question-generation-runs.repository.js';
import { type BankJd, QuestionBankService } from './question-bank.service.js';
import { runView } from './views.js';

/**
 * The exam blueprint of a JD as CENTER sees and edits it (BR-05, US-4.1 AC-2, AC-3, US-4.10 AC-5,
 * CONTEXT D49, D60): the blueprint, the drafts of each cell against its 3×–5× bounds, and the
 * latest run of each kind (generation, AI check). The blueprint changes only while the bank is not
 * locked and no run is RUNNING, so a job never fills cells the blueprint no longer has.
 */
@Injectable()
export class BlueprintService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly questionBanks: QuestionBankService,
    private readonly banks: QuestionBanksRepository,
    private readonly runs: QuestionGenerationRunsRepository,
    private readonly audit: AuditService,
  ) {}

  /**
   * AC-3. A JD approved without a bank (its `jd.approved` missed or not handled yet) gets it here,
   * without a job; the listener still sends the first one while the bank has no run. A RUNNING run
   * whose result can no longer come is closed as STALE here too: the screen keeps editing, "Sinh
   * câu còn thiếu" and "Kiểm câu bằng AI" off while a run shows RUNNING, so only this read can free
   * them (LESSONS §34).
   */
  async get(jdId: number): Promise<ExamBlueprintView> {
    const jd = await this.questionBanks.requireBankJd(jdId);
    let bank = await this.banks.findByJd(jdId);
    let runs = bank && (await this.latestRuns(bank.id));
    const overdue = runs && [runs.generation, runs.validation].some((run) => run && this.questionBanks.isOverdue(run));
    if (!bank || !runs || overdue) {
      bank = await this.db.transaction(async (tx) => {
        const locked = await this.questionBanks.lockBank(tx, jd, SYSTEM_ACTOR);
        await this.questionBanks.runningRun(tx, locked.id);
        return locked;
      });
      runs = await this.latestRuns(bank.id);
    }
    return this.viewOf(jd, bank, runs);
  }

  /**
   * AC-2, AC-3: the blueprint is checked against the JD's current requirements (400 per field),
   * then 409 when the bank is locked, a generation runs or `rowVersion` is not the stored one. The
   * bank then records that requirements version: its blueprint was built from it.
   */
  async update(user: AuthUser, jdId: number, body: UpdateExamBlueprintRequest): Promise<ExamBlueprintView> {
    const jd = await this.questionBanks.requireBankJd(jdId);
    const blueprint = parseOrFail(examBlueprintRequestSchema(jd.requirements), body.blueprint, 'blueprint');
    const actor = userActor(user);
    await this.db.transaction(async (tx) => {
      const bank = await this.questionBanks.lockBank(tx, jd, actor);
      if (bank.status === 'LOCKED') throw new QuestionBankLockedError(bank.id);
      const running = await this.questionBanks.runningRun(tx, bank.id);
      if (running) throw new QuestionGenerationRunningError(bank.id, running.id);
      if (bank.rowVersion !== body.rowVersion) {
        throw new RowVersionConflictError(QUESTION_BANK_ENTITY, bank.id, body.rowVersion, bank.rowVersion);
      }
      const before = cvVerificationOf(bank);
      const cvVerification = body.cvVerification ?? before;
      await this.banks.updateBlueprint(tx, bank.id, body.rowVersion, { blueprint, jdVersion: jd.jdVersion, cvVerification });
      await this.audit.record(tx, {
        actor,
        action: ASSESSMENT_AUDIT_ACTIONS.EXAM_BLUEPRINT_UPDATED,
        entity: QUESTION_BANK_ENTITY,
        entityId: bank.id,
        before: { blueprint: bank.blueprint, jdVersion: bank.jdVersion, cvVerification: before },
        after: { blueprint, jdVersion: jd.jdVersion, cvVerification },
      });
    });
    return this.get(jdId);
  }

  /** US-4.2 AC-6: `POST /api/question-banks/{id}/lock`; the view of the locked bank. */
  async lock(user: AuthUser, bankId: number, body: LockQuestionBankRequest): Promise<ExamBlueprintView> {
    const { jdId } = await this.questionBanks.lock(bankId, userActor(user), body.rowVersion);
    return this.get(jdId);
  }

  private async latestRuns(bankId: number): Promise<LatestRuns> {
    const [generation, validation] = await Promise.all([
      this.runs.latest(bankId, 'GENERATE'),
      this.runs.latest(bankId, 'VALIDATE'),
    ]);
    return { generation, validation };
  }

  private async viewOf(jd: BankJd, bank: QuestionBankRecord, runs: LatestRuns): Promise<ExamBlueprintView> {
    const [counts, reasons] = await Promise.all([
      this.banks.countQuestions(bank.id),
      this.banks.countRejectReasons(bank.id),
    ]);
    const coverage = coverageOf(bank.blueprint, counts, reasons);
    const locked = bank.status === 'LOCKED';
    const { generation, validation } = runs;
    const generationRunning = generation?.status === 'RUNNING' || validation?.status === 'RUNNING';
    // A locked bank keeps the requirements it was locked with (US-4.2 AC-11).
    const jdOutdated = !locked && bank.jdVersion < jd.jdVersion;
    const blockers = lockBlockers({ status: bank.status, generationRunning, jdOutdated, coverage });
    return {
      jdId: jd.jdId,
      bankId: bank.id,
      jdVersion: bank.jdVersion,
      jdOutdated,
      rowVersion: bank.rowVersion,
      status: bank.status,
      locked,
      version: bank.version,
      lockedAt: bank.lockedAt?.toISOString() ?? null,
      lock: { allowed: blockers.length === 0, blockers },
      editable: !locked && !generationRunning,
      blueprint: bank.blueprint,
      cvVerification: cvVerificationOf(bank),
      requirements: jd.requirements,
      coverage,
      run: generation ? runView(generation) : null,
      validationRun: validation ? runView(validation) : null,
    };
  }
}

/** The latest run of each kind of a bank. */
interface LatestRuns {
  generation: QuestionGenerationRunRecord | undefined;
  validation: QuestionGenerationRunRecord | undefined;
}

/** Part C of the bank (US-4.8 AC-1). */
function cvVerificationOf(bank: QuestionBankRecord): CvVerificationSettings {
  return { enabled: bank.cvVerificationEnabled, questionCount: bank.cvVerificationCount };
}
