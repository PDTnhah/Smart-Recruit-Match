import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { AI_RESULT_EVENTS, type AiResultEvent } from '../../aigateway/index.js';
import { type StoredQuestion, toStoredQuestion } from '../domain/stored-question.js';
import { QuestionBanksRepository } from '../infrastructure/question-banks.repository.js';
import { QuestionGenerationRunsRepository, type QuestionRunEnd } from '../infrastructure/question-generation-runs.repository.js';

type Applied =
  | { kind: 'UNKNOWN_JOB' }
  | { kind: 'APPLIED'; bankId: number; received: number; refused: number; skipped: 'LOCKED' | 'OTHER_BANK' | null };

/**
 * Results of the Test Generator (US-4.1 AC-9, CONTEXT D49). A QUESTIONS_GENERATE result carries
 * every draft of the bank, those of earlier jobs too; each is stored once by `draft_id`, status
 * DRAFT, with the model and prompt that wrote it (Invariant 12), and the run is closed with the
 * cells still missing drafts.
 *
 * Listener convention of aigateway/domain/events.ts: the consumer has checked the message with Zod
 * and awaits this listener, so a database failure is retried once and then dead-lettered. A
 * duplicate adds no row and leaves the closed run as it is. The run holds the job id from before
 * the job was sent, so a result that comes before `dispatch` returns still finds it (LESSONS §33).
 */
@Injectable()
export class QuestionResultsHandler {
  private readonly logger = new Logger(QuestionResultsHandler.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly banks: QuestionBanksRepository,
    private readonly runs: QuestionGenerationRunsRepository,
  ) {}

  @OnEvent(AI_RESULT_EVENTS.QUESTIONS_GENERATE, { suppressErrors: false })
  async apply(result: AiResultEvent<'QUESTIONS_GENERATE'>): Promise<void> {
    const { job } = result;
    const output = result.result;
    const applied = await this.db.transaction(async (tx): Promise<Applied> => {
      const run = await this.runs.findByJob(tx, job.job_id);
      if (!run) return { kind: 'UNKNOWN_JOB' };
      // The row lock orders this write with the lock of the bank (US-4.2).
      const bank = await this.banks.lock(tx, run.bankId);
      let stored: StoredQuestion[] = [];
      let refused = 0;
      let skipped: 'LOCKED' | 'OTHER_BANK' | null = null;
      if (output !== null) {
        if (output.bank_id !== run.bankId) skipped = 'OTHER_BANK';
        // A locked bank is final: drafts that come after are not added to it.
        else if (!bank || bank.lockedAt !== null) skipped = 'LOCKED';
        else {
          const all = output.questions.map(toStoredQuestion);
          stored = all.filter((question): question is StoredQuestion => question !== null);
          refused = all.length - stored.length;
        }
      }
      const received = await this.banks.insertQuestions(tx, run.bankId, stored);
      await this.runs.finishJob(tx, job.job_id, received, endOf(result));
      return { kind: 'APPLIED', bankId: run.bankId, received, refused, skipped };
    });

    if (applied.kind === 'UNKNOWN_JOB') {
      this.logger.warn(`job ${job.job_id}: no question generation run has it; result of bank ${job.bank_id} dropped`);
      return;
    }
    if (applied.skipped !== null) {
      this.logger.warn(`job ${job.job_id}: drafts not stored, bank ${applied.bankId} ${applied.skipped}`);
    }
    if (applied.refused > 0) {
      this.logger.warn(`job ${job.job_id}: ${applied.refused} drafts without exactly one correct option refused`);
    }
    this.logger.log(
      `job ${job.job_id}: generation of bank ${applied.bankId} ${result.status}, ${applied.received} new drafts, ${output?.missing_cells.length ?? 0} cells missing`,
    );
  }
}

/** The run takes the status of the job; a job that failed as a whole names its error. */
function endOf(result: AiResultEvent<'QUESTIONS_GENERATE'>): QuestionRunEnd {
  if (result.status === 'FAILED' || result.result === null) {
    return { status: 'FAILED', missingCells: null, errorCode: result.error?.code ?? 'AI_JOB_FAILED' };
  }
  return { status: result.status, missingCells: result.result.missing_cells, errorCode: null };
}
