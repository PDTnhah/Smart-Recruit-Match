import { Inject, Injectable } from '@nestjs/common';
import { toHundredths } from '@srm/shared';
import { StateTransitionService } from '../../../common/state/index.js';
import { applicationLifecycle } from '../../../db/lifecycles.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { SYSTEM_ACTOR } from '../../audit/index.js';
import { JdService } from '../../company/index.js';
import { CvService } from '../../student/index.js';
import { BELOW_THETA_TEST_REASON, TEST_GRADED_REASON } from '../domain/audit-actions.js';
import { RULES_VERSION } from '../domain/rules-version.js';
import { MatchResultsRepository } from '../infrastructure/match-results.repository.js';
import { type PreferenceRow, PreferencesRepository } from '../infrastructure/preferences.repository.js';

/** A preference as grading sees it: the student's application to the JD of a test (US-4.4). */
export type GradingPreference = PreferenceRow;

/**
 * What grading in the assessment module needs of preferences (US-4.4 AC-10, AC-11, AC-14, CONTEXT
 * D53), so it never reads `core.preferences` or `core.match_results` itself (AGENTS › Invariant 13).
 * One bank per JD and one session per student and bank, so a session names its preference by
 * `(student_id, jd_id)`.
 */
@Injectable()
export class PreferenceGradingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly repository: PreferencesRepository,
    private readonly results: MatchResultsRepository,
    private readonly cvs: CvService,
    private readonly jds: JdService,
    private readonly transitions: StateTransitionService,
  ) {}

  /** The student's preference for the JD, read without a lock: for a result page only. */
  async findForGrading(studentId: number, jdId: number): Promise<GradingPreference | undefined> {
    return this.repository.findByStudentAndJd(studentId, jdId);
  }

  /**
   * The same preference locked `FOR UPDATE` in `tx`, after the session's row lock: publishing the
   * results and the threshold sweep queue on it, so each sees the other's outcome (LESSONS §38).
   */
  async lockForGrading(studentId: number, jdId: number, options: { tx: DbTx }): Promise<GradingPreference | undefined> {
    return this.repository.findByStudentAndJd(studentId, jdId, { tx: options.tx, lock: 'update' });
  }

  /**
   * S_cv × 100 that S_final is computed from (CONTEXT D47, D53): the student's active confirmed CV
   * of the campaign, the JD's newest version up to the current one that was scored, the current
   * rules and the campaign's pinned prompt. Read `FOR SHARE` in `tx` when given. Null when the pair
   * has no such result: the caller does not publish without it.
   */
  async currentScvX100(
    preference: Pick<GradingPreference, 'campaignId' | 'studentId' | 'jdId'>,
    options: { tx?: DbTx } = {},
  ): Promise<number | null> {
    const cv = (await this.cvs.activeCvsOf(preference.studentId)).find(
      (active) => active.campaignId === preference.campaignId && active.status === 'CONFIRMED',
    );
    const [jd] = await this.jds.listCardsByIds([preference.jdId]);
    if (!cv || !jd) return null;
    const read = async (tx: DbTx | Database): Promise<number | null> => {
      const promptVersion = await this.results.pinnedPrompt(tx, preference.campaignId);
      if (promptVersion === null) return null;
      const sCv = await this.results.latestScv(tx, {
        campaignId: preference.campaignId,
        rulesVersion: RULES_VERSION,
        promptVersion,
        cvId: cv.cvId,
        cvVersion: cv.cvVersion,
        jdId: jd.jdId,
        jdVersion: jd.jdVersion,
      });
      return sCv === null ? null : toHundredths(sCv);
    };
    return read(options.tx ?? this.db);
  }

  /** AC-14: the campaign's preferences graded and not moved on yet, by id. */
  async listTestGraded(campaignId: number): Promise<GradingPreference[]> {
    return this.repository.rowsInStatus(campaignId, 'TEST_GRADED');
  }

  /**
   * AC-11: PENDING_TEST → TEST_GRADED with S_final and the S_cv it came from, written by the same
   * UPDATE, audited in `tx`. A row changed since `rowVersion` was read fails with
   * `RowVersionConflictError`; the grading sweep tries again.
   */
  async markTestGraded(
    id: number,
    rowVersion: number,
    scores: { sCvX100: number; sFinalX100: number },
    options: { tx: DbTx },
  ): Promise<void> {
    await this.transitions.transitionTo({
      lifecycle: applicationLifecycle,
      id,
      to: 'TEST_GRADED',
      actor: SYSTEM_ACTOR,
      reason: TEST_GRADED_REASON,
      expectedRowVersion: rowVersion,
      set: { sCv: scores.sCvX100 / 100, sFinal: scores.sFinalX100 / 100 },
      tx: options.tx,
    });
  }

  /** AC-14 (BR-07): TEST_GRADED → BELOW_THRESHOLD, audited in `tx`; same conflict rule. */
  async markBelowThreshold(id: number, rowVersion: number, options: { tx: DbTx }): Promise<void> {
    await this.transitions.transitionTo({
      lifecycle: applicationLifecycle,
      id,
      to: 'BELOW_THRESHOLD',
      actor: SYSTEM_ACTOR,
      reason: BELOW_THETA_TEST_REASON,
      expectedRowVersion: rowVersion,
      tx: options.tx,
    });
  }
}
