import { Inject, Injectable } from '@nestjs/common';
import type { DbTx } from '../../../db/types.js';
import { type AllocationSessionRow, ExamGradingRepository } from '../infrastructure/exam-grading.repository.js';
import { THRESHOLD_HOLDS, type ThresholdHolds } from './threshold-holds.js';

/** A test as an allocation round reads it (US-5.2): S_test, submission time, Grader passes. */
export interface AllocationSessionResult extends AllocationSessionRow {
  /** Distinct model and prompt of the AI passes over its essays; empty when none (BR-17). */
  graders: { model: string; promptVersion: string }[];
}

/**
 * What the allocation module needs of the tests (US-5.2 AC-1, AC-3, AC-6), so it never reads
 * `core.exam_sessions` or `core.exam_answers` itself (AGENTS › Invariant 13). One bank per JD and
 * one session per student and bank, so a session names its preference by `(studentId, jdId)`.
 */
@Injectable()
export class AllocationResultsService {
  constructor(
    private readonly grading: ExamGradingRepository,
    @Inject(THRESHOLD_HOLDS) private readonly holds: ThresholdHolds,
  ) {}

  /** Every session of the campaign with its results and Grader passes, read in `tx`, by session id. */
  async listForAllocation(campaignId: number, options: { tx: DbTx }): Promise<AllocationSessionResult[]> {
    const sessions = await this.grading.listForAllocation(options.tx, campaignId);
    const runs = await this.grading.graderRunsOf(
      options.tx,
      sessions.map((session) => session.sessionId),
    );
    return sessions.map((session) => ({ ...session, graders: runs.get(session.sessionId) ?? [] }));
  }

  /** Sessions among `sessionIds` with an appeal still open (US-4.6 provides them; none until then). */
  heldSessionIds(sessionIds: readonly number[]): Promise<Set<number>> {
    return this.holds.heldSessionIds(sessionIds);
  }
}
