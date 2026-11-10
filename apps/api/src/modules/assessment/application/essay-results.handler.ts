import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { EssayGradeFailedItem, EssayGradeItem } from '@srm/shared';
import { errorMessage } from '../../../common/errors/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { AI_RESULT_EVENTS, type AiResultEvent } from '../../aigateway/index.js';
import {
  GRADING_OUT_OF_RANGE,
  type PassEntry,
  passKeyOf,
  passPoints,
  rubricProblem,
  withPass,
} from '../domain/essay-pass.js';
import { EssayGradingRunsRepository } from '../infrastructure/essay-grading-runs.repository.js';
import { ExamGradingRepository, type LockedEssayAnswer } from '../infrastructure/exam-grading.repository.js';
import { EssayGradingService } from './essay-grading.service.js';
import { GradingService } from './grading.service.js';

/** Code of the passes a job that failed whole leaves without a grade, when it names none. */
const JOB_FAILED_CODE = 'AI_JOB_FAILED';

type Entry = { kind: 'ITEM'; item: EssayGradeItem } | { kind: 'FAILED'; failed: EssayGradeFailedItem };

interface Counts {
  stored: number;
  outOfRange: number;
  /** Already there, or the answer has its final score (graded by staff meanwhile). */
  skipped: number;
  /** Not an essay answer of a session of the job. */
  unknown: number;
  /** Last message only: essays of the run still missing a pass. */
  missing: number;
}

type Applied = { kind: 'UNKNOWN_JOB' } | { kind: 'APPLIED'; runId: number; sessions: number[]; counts: Counts };

const answerKey = (sessionId: number, questionId: number) => `${sessionId}:${questionId}`;

/**
 * Results of the Grader (US-4.4 AC-4, AC-5, AC-7, CONTEXT D53). Each message of an ESSAY_GRADE job
 * carries passes, graded or failed; each is stored once in `exam_answers.ai_grading` with its model
 * and prompt (Invariant 12), whatever order the messages arrive in. The points are checked against
 * the rubric again: a grade that does not fit is stored as a GRADING_OUT_OF_RANGE failure, so the
 * essay goes to a human grader and the message never goes to the DLQ (LESSONS §32). An answer graded
 * by staff meanwhile keeps its score. The last message closes the run once every pass is in; a
 * pass still missing (a message lost to the DLQ, or one applied later) keeps it RUNNING until the
 * stale sweep fails what is left. A job that failed whole turns every pass still missing into a
 * failure. Completeness is read from the answers, never from the last message (LESSONS §33): after
 * the commit, each session touched is offered to `finalizeIfReady`, whose failures the grading
 * sweep retries.
 *
 * Listener convention of aigateway/domain/events.ts. The run's row lock orders the messages of one
 * job; the run holds the job id from before the job was sent (LESSONS §33).
 */
@Injectable()
export class EssayResultsHandler {
  private readonly logger = new Logger(EssayResultsHandler.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly runs: EssayGradingRunsRepository,
    private readonly grading: ExamGradingRepository,
    private readonly essays: EssayGradingService,
    private readonly results: GradingService,
  ) {}

  @OnEvent(AI_RESULT_EVENTS.ESSAY_GRADE, { suppressErrors: false })
  async apply(result: AiResultEvent<'ESSAY_GRADE'>): Promise<void> {
    const { job } = result;
    const output = result.result;
    const applied = await this.db.transaction(async (tx): Promise<Applied> => {
      const run = await this.runs.lockByJob(tx, job.job_id);
      if (!run) return { kind: 'UNKNOWN_JOB' };
      const counts: Counts = { stored: 0, outOfRange: 0, skipped: 0, unknown: 0, missing: 0 };
      const sessions = new Set<number>();
      if (output !== null) {
        await this.runs.setPromptVersion(tx, run.id, output.prompt_version);
        const inJob = new Set(job.exam_session_ids);
        const entries: Entry[] = [
          ...output.items.map((item): Entry => ({ kind: 'ITEM', item })),
          ...output.failed.map((failed): Entry => ({ kind: 'FAILED', failed })),
        ].filter((entry) => {
          const known = inJob.has(entryOf(entry).session_id);
          if (!known) counts.unknown += 1;
          return known;
        });
        for (const sessionId of await this.storePasses(tx, entries, output.prompt_version, counts)) sessions.add(sessionId);
      }
      if (result.status === 'FAILED' || output === null) {
        const code = result.error?.code ?? JOB_FAILED_CODE;
        for (const sessionId of await this.essays.failIncompletePasses(tx, run.id, code)) sessions.add(sessionId);
        await this.runs.finish(tx, run.id, 'FAILED', code);
      } else if (output.final) {
        const missing = await this.grading.countIncompleteOfRun(tx, run.id);
        if (missing === 0) await this.runs.finish(tx, run.id, result.status === 'PARTIAL' ? 'PARTIAL' : 'SUCCEEDED', null);
        else counts.missing = missing;
      }
      return { kind: 'APPLIED', runId: run.id, sessions: [...sessions].sort((a, b) => a - b), counts };
    });

    if (applied.kind === 'UNKNOWN_JOB') {
      this.logger.warn(`job ${job.job_id}: no essay grading run has it; result dropped`);
      return;
    }
    const { counts } = applied;
    this.logger.log(
      `job ${job.job_id}: essay grading run ${applied.runId} ${result.status}${output?.final ? ' (last)' : ''}, ` +
        `${counts.stored} passes stored, ${counts.outOfRange} out of range, ${counts.skipped} skipped, ${counts.unknown} unknown`,
    );
    if (counts.missing > 0) {
      this.logger.warn(`job ${job.job_id}: last message in, ${counts.missing} essays still miss a pass; run ${applied.runId} stays RUNNING`);
    }
    for (const sessionId of applied.sessions) {
      try {
        await this.results.finalizeIfReady(sessionId);
      } catch (error) {
        this.logger.error(`exam session ${sessionId}: not finalized after job ${job.job_id}: ${errorMessage(error)}`);
      }
    }
  }

  /** AC-4, AC-5: each pass once, checked against the rubric; returns the sessions touched. */
  private async storePasses(tx: DbTx, entries: readonly Entry[], promptVersion: string, counts: Counts): Promise<number[]> {
    const pairs = new Map<string, { sessionId: number; questionId: number }>();
    for (const entry of entries) {
      const { session_id: sessionId, question_id: questionId } = entryOf(entry);
      pairs.set(answerKey(sessionId, questionId), { sessionId, questionId });
    }
    const locked = await this.grading.lockEssayAnswers(tx, [...pairs.values()]);
    const answers = new Map<string, LockedEssayAnswer>(
      locked.map((answer) => [answerKey(answer.sessionId, answer.questionId), answer]),
    );
    const touched = new Set<number>();
    for (const entry of entries) {
      const ref = entryOf(entry);
      const answer = answers.get(answerKey(ref.session_id, ref.question_id));
      if (!answer) {
        counts.unknown += 1;
        continue;
      }
      if (answer.finalScore !== null) {
        counts.skipped += 1;
        continue;
      }
      const pass = this.passOf(entry, answer, promptVersion, counts);
      const next = withPass(answer.aiGrading, passKeyOf(ref.pass_no), pass);
      if (next === null) {
        counts.skipped += 1;
        continue;
      }
      await this.grading.writeAiGrading(tx, answer.sessionId, answer.questionId, next);
      // One message may carry both passes of an answer.
      answer.aiGrading = next;
      counts.stored += 1;
      touched.add(answer.sessionId);
    }
    return [...touched];
  }

  private passOf(entry: Entry, answer: LockedEssayAnswer, promptVersion: string, counts: Counts): PassEntry {
    if (entry.kind === 'FAILED') {
      const { code, needs_review } = entry.failed;
      return { kind: 'FAILURE', failure: { code, needs_review, prompt_version: promptVersion } };
    }
    const { item } = entry;
    const problem = answer.rubric ? rubricProblem(item.grading, answer.rubric) : 'the question has no rubric';
    if (problem !== null) {
      counts.outOfRange += 1;
      this.logger.warn(`exam session ${item.session_id}, question ${item.question_id}, pass ${item.pass_no}: ${problem}`);
      return { kind: 'FAILURE', failure: { code: GRADING_OUT_OF_RANGE, needs_review: false, prompt_version: promptVersion } };
    }
    return {
      kind: 'RUN',
      run: { model: item.model, prompt_version: promptVersion, grading: item.grading, points: passPoints(item.grading) },
    };
  }
}

function entryOf(entry: Entry): EssayGradeItem | EssayGradeFailedItem {
  return entry.kind === 'ITEM' ? entry.item : entry.failed;
}
