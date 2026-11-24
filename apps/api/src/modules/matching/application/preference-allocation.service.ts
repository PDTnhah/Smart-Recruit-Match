import { Injectable } from '@nestjs/common';
import { StateTransitionService } from '../../../common/state/index.js';
import { applicationLifecycle } from '../../../db/lifecycles.js';
import type { DbTx } from '../../../db/types.js';
import type { Actor } from '../../audit/index.js';
import { CvService } from '../../student/index.js';
import { RULES_VERSION } from '../domain/rules-version.js';
import { type AllocationMatchRow, MatchResultsRepository } from '../infrastructure/match-results.repository.js';
import { type PreferenceRow, PreferencesRepository } from '../infrastructure/preferences.repository.js';

/** A preference as an allocation round reads it, with the current result of its pair (US-5.2). */
export interface AllocationPreference extends PreferenceRow {
  /** Null when the pair has no result for the student's active confirmed CV. */
  match: Omit<AllocationMatchRow, 'cvId' | 'jdId'> | null;
}

/**
 * What the allocation module needs of preferences (US-5.2 AC-1, AC-2, AC-10, CONTEXT D64), so it
 * never reads `core.preferences` or `core.match_results` itself (AGENTS › Invariant 13).
 */
@Injectable()
export class PreferenceAllocationService {
  constructor(
    private readonly repository: PreferencesRepository,
    private readonly results: MatchResultsRepository,
    private readonly cvs: CvService,
    private readonly transitions: StateTransitionService,
  ) {}

  /**
   * Every preference of the campaign, by student then rank, with the hard filter, S_cv, model and
   * prompt of its pair: the student's active confirmed CV, the current rules, the campaign's pinned
   * prompt (CONTEXT D46, D47). Read in `tx`; `lock: 'update'` holds the rows until it ends.
   */
  async listForAllocation(
    campaignId: number,
    options: { tx: DbTx; lock?: 'update' },
  ): Promise<AllocationPreference[]> {
    const rows = await this.repository.rowsOfCampaign(options.tx, campaignId, { lock: options.lock });
    const cvs = await this.cvs.listConfirmedKeys(campaignId);
    const pinned = await this.results.pinnedPrompt(options.tx, campaignId);
    const current = await this.results.currentOfCvs(options.tx, campaignId, RULES_VERSION, pinned, cvs);
    const cvOf = new Map(cvs.map((cv) => [cv.studentId, cv.cvId]));
    return rows.map((row) => {
      const cvId = cvOf.get(row.studentId);
      const found = cvId === undefined ? undefined : current.get(`${cvId}:${row.jdId}`);
      if (!found) return { ...row, match: null };
      return {
        ...row,
        match: {
          eligible: found.eligible,
          ineligibleCodes: found.ineligibleCodes,
          sCv: found.sCv,
          model: found.model,
          promptVersion: found.promptVersion,
        },
      };
    });
  }

  /** AC-10: TEST_GRADED or WAITING_NEXT_ROUND → NOMINATED, audited in `tx`. */
  async markNominated(id: number, rowVersion: number, actor: Actor, reason: string, options: { tx: DbTx }): Promise<void> {
    await this.transitions.transitionTo({
      lifecycle: applicationLifecycle,
      id,
      to: 'NOMINATED',
      actor,
      reason,
      expectedRowVersion: rowVersion,
      tx: options.tx,
    });
  }

  /** AC-10: TEST_GRADED → WAITING_NEXT_ROUND (not chosen in this round), audited in `tx`. */
  async markWaitingNextRound(
    id: number,
    rowVersion: number,
    actor: Actor,
    reason: string,
    options: { tx: DbTx },
  ): Promise<void> {
    await this.transitions.transitionTo({
      lifecycle: applicationLifecycle,
      id,
      to: 'WAITING_NEXT_ROUND',
      actor,
      reason,
      expectedRowVersion: rowVersion,
      tx: options.tx,
    });
  }

  /**
   * AC-10 (BR-07): TEST_GRADED → BELOW_THRESHOLD for a graded pair the round kept out (hard filter
   * or θ_cv): no round can nominate it, so it does not wait for the next one. Audited in `tx`.
   */
  async markNotEligible(id: number, rowVersion: number, actor: Actor, reason: string, options: { tx: DbTx }): Promise<void> {
    await this.transitions.transitionTo({
      lifecycle: applicationLifecycle,
      id,
      to: 'BELOW_THRESHOLD',
      actor,
      reason,
      expectedRowVersion: rowVersion,
      tx: options.tx,
    });
  }
}
