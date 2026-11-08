import { Injectable } from '@nestjs/common';
import { StateTransitionService } from '../../../common/state/index.js';
import { applicationLifecycle } from '../../../db/lifecycles.js';
import type { DbTx } from '../../../db/types.js';
import { SYSTEM_ACTOR } from '../../audit/index.js';
import { TEST_NOT_TAKEN_REASON } from '../domain/audit-actions.js';
import { type PreferenceRow, PreferencesRepository } from '../infrastructure/preferences.repository.js';

/** A preference as the exam room sees it: the student's application to one JD (US-4.3). */
export type ExamPreference = PreferenceRow;

/**
 * What the exam room of the assessment module needs of preferences (US-4.3 AC-1, AC-5, AC-10,
 * CONTEXT D51), so it never reads `core.preferences` itself (AGENTS › Invariant 13). A preference of
 * another student reads as missing, so the caller answers 404 for it as for one that does not exist
 * (BR-11).
 */
@Injectable()
export class PreferenceExamService {
  constructor(
    private readonly repository: PreferencesRepository,
    private readonly transitions: StateTransitionService,
  ) {}

  /** The student's preference `id`, read without a lock: for an early 404 or 409 only. */
  async findForStudent(id: number, studentId: number): Promise<ExamPreference | undefined> {
    return ownedBy(await this.repository.findRow(id), studentId);
  }

  /**
   * The same preference locked `FOR UPDATE` in `tx`: a start and the sweep that closes untaken
   * preferences queue on this lock, so each sees the other's outcome (LESSONS §38).
   */
  async lockForExam(id: number, studentId: number, options: { tx: DbTx }): Promise<ExamPreference | undefined> {
    return ownedBy(await this.repository.findRow(id, { tx: options.tx, lock: 'update' }), studentId);
  }

  /** Every preference of the student, newest campaign first, NV1 first within one. */
  async listForStudent(studentId: number): Promise<ExamPreference[]> {
    return this.repository.rowsOfStudent(studentId);
  }

  /** Preferences of the campaign still waiting for their test, by id. */
  async listPendingTest(campaignId: number): Promise<ExamPreference[]> {
    return this.repository.rowsInStatus(campaignId, 'PENDING_TEST');
  }

  /**
   * AC-10 (BR-06): PENDING_TEST → CLOSED with reason `TEST_NOT_TAKEN`, audited in `tx`. A row that
   * changed since `rowVersion` was read fails with `RowVersionConflictError`; the sweep skips it and
   * tries again on its next run.
   */
  async closeTestNotTaken(id: number, rowVersion: number, options: { tx: DbTx }): Promise<void> {
    await this.transitions.transitionTo({
      lifecycle: applicationLifecycle,
      id,
      to: 'CLOSED',
      actor: SYSTEM_ACTOR,
      reason: TEST_NOT_TAKEN_REASON,
      expectedRowVersion: rowVersion,
      // CLOSED is also reachable from later states; only an untaken test closes here.
      guard: (row) => (row.status === 'PENDING_TEST' ? { ok: true } : { ok: false, reasonCode: 'NOT_PENDING_TEST' }),
      tx: options.tx,
    });
  }
}

function ownedBy(row: PreferenceRow | undefined, studentId: number): ExamPreference | undefined {
  return row?.studentId === studentId ? row : undefined;
}
