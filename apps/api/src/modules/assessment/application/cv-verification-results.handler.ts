import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { CvVerdict, CvVerificationEvaluationItem } from '@srm/shared';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { AI_RESULT_EVENTS, type AiResultEvent } from '../../aigateway/index.js';
import { computeCvTrust, draftProblem, storedEvaluationOf } from '../domain/cv-verification.js';
import { type CvVerificationRecord, CvVerificationsRepository } from '../infrastructure/cv-verifications.repository.js';

/** Code of a job that failed whole without naming why. */
const JOB_FAILED_CODE = 'AI_JOB_FAILED';

/** The drafted questions break a rule the backend checks again (LESSONS §32). */
export const INVALID_QUESTIONS_CODE = 'INVALID_QUESTIONS';

/** The check gave no verdict for a question of the session. */
export const MISSING_VERDICTS_CODE = 'MISSING_VERDICTS';

type Outcome = 'UNKNOWN_JOB' | 'ALREADY_APPLIED' | 'READY' | 'DONE' | 'FAILED';

/**
 * Results of the two part C jobs (FR-25, US-4.8 AC-2, AC-5, CONTEXT D57). Listener convention of
 * aigateway/domain/events.ts: the row's lock orders a result against the sweep and the start of an
 * exam, and a result applied twice finds the row no longer RUNNING. A failure stays logged on the
 * row; the student keeps the test without part C, or CENTER sees the check failed. Nothing here is
 * scored or changes a state (AC-6).
 */
@Injectable()
export class CvVerificationResultsHandler {
  private readonly logger = new Logger(CvVerificationResultsHandler.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly verifications: CvVerificationsRepository,
  ) {}

  /** AC-2: the questions with their model and prompt (Invariant 12), or the reason there are none. */
  @OnEvent(AI_RESULT_EVENTS.CV_VERIFY_GENERATE, { suppressErrors: false })
  async applyDraft(result: AiResultEvent<'CV_VERIFY_GENERATE'>): Promise<void> {
    const { job } = result;
    const output = result.result;
    const outcome = await this.db.transaction(async (tx): Promise<{ kind: Outcome; detail?: string }> => {
      const row = await this.verifications.lockByJob(tx, job.job_id);
      if (!row) return { kind: 'UNKNOWN_JOB' };
      if (row.status !== 'RUNNING') return { kind: 'ALREADY_APPLIED' };
      if (result.status === 'FAILED' || output === null) {
        const code = result.error?.code ?? JOB_FAILED_CODE;
        await this.verifications.markFailed(tx, row.id, code, null);
        return { kind: 'FAILED', detail: code };
      }
      const by = { model: output.model, promptVersion: output.prompt_version };
      const problem = draftProblem(output.questions, row.questionCount);
      if (problem !== null) {
        await this.verifications.markFailed(tx, row.id, INVALID_QUESTIONS_CODE, by);
        return { kind: 'FAILED', detail: `${INVALID_QUESTIONS_CODE}: ${problem}` };
      }
      await this.verifications.markReady(tx, row.id, { ...by, questions: output.questions });
      return { kind: 'READY', detail: `${output.questions.length} questions` };
    });
    this.log('drafting', job.job_id, job.preference_id, outcome);
  }

  /** AC-5: the verdict of each question, then the trust index code computes from them (AD-2). */
  @OnEvent(AI_RESULT_EVENTS.CV_VERIFY_EVALUATE, { suppressErrors: false })
  async applyEvaluation(result: AiResultEvent<'CV_VERIFY_EVALUATE'>): Promise<void> {
    const { job } = result;
    const output = result.result;
    const outcome = await this.db.transaction(async (tx): Promise<{ kind: Outcome; detail?: string }> => {
      const row = await this.verifications.lockByEvaluationJob(tx, job.job_id);
      if (!row) return { kind: 'UNKNOWN_JOB' };
      if (row.evaluationStatus !== 'RUNNING') return { kind: 'ALREADY_APPLIED' };
      if (result.status === 'FAILED' || output === null) {
        const code = result.error?.code ?? JOB_FAILED_CODE;
        await this.failEvaluation(tx, row, code);
        return { kind: 'FAILED', detail: code };
      }
      const itemOf = new Map(output.items.map((item) => [item.question_id, item]));
      const questions = await this.verifications.questionsOf(row.id, tx);
      if (questions.length === 0 || questions.some((question) => !itemOf.has(question.id))) {
        await this.failEvaluation(tx, row, MISSING_VERDICTS_CODE);
        return { kind: 'FAILED', detail: MISSING_VERDICTS_CODE };
      }
      const verdicts: CvVerdict[] = [];
      for (const question of questions) {
        const evaluation = storedEvaluationOf(question.answer, itemOf.get(question.id) as CvVerificationEvaluationItem);
        await this.verifications.writeEvaluation(tx, question.id, evaluation);
        verdicts.push(evaluation.verdict);
      }
      const trust = computeCvTrust(verdicts);
      await this.verifications.finishEvaluation(tx, row.id, {
        status: 'DONE',
        model: output.model,
        promptVersion: output.prompt_version,
        errorCode: null,
        trustX100: trust.trustX100,
        trustLevel: trust.level,
      });
      return { kind: 'DONE', detail: `trust ${trust.trustX100} (${trust.level})` };
    });
    this.log('checking', job.job_id, job.preference_id, outcome);
  }

  private async failEvaluation(tx: DbTx, row: CvVerificationRecord, code: string): Promise<void> {
    await this.verifications.finishEvaluation(tx, row.id, {
      status: 'FAILED',
      model: null,
      promptVersion: null,
      errorCode: code,
      trustX100: null,
      trustLevel: null,
    });
  }

  private log(step: string, jobId: string, preferenceId: number, outcome: { kind: Outcome; detail?: string }): void {
    const what = `job ${jobId}: part C ${step} of preference ${preferenceId}`;
    switch (outcome.kind) {
      case 'UNKNOWN_JOB':
        this.logger.warn(`${what}: no row has the job; result dropped`);
        return;
      case 'ALREADY_APPLIED':
        this.logger.log(`${what}: already applied or closed; result dropped`);
        return;
      case 'FAILED':
        this.logger.warn(`${what}: FAILED, ${outcome.detail ?? ''}`);
        return;
      default:
        this.logger.log(`${what}: ${outcome.kind}, ${outcome.detail ?? ''}`);
    }
  }
}
