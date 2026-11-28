import { Inject, Injectable } from '@nestjs/common';
import { type ApplicationStatus, canTransition, applicationMachine, type NominationMatch } from '@srm/shared';
import { EntityNotFoundError } from '../../../common/errors/index.js';
import { StateTransitionService } from '../../../common/state/index.js';
import { applicationLifecycle } from '../../../db/lifecycles.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import type { Actor } from '../../audit/index.js';
import { CvService } from '../../student/index.js';
import { RULES_VERSION } from '../domain/rules-version.js';
import type { ShortlistRow } from '../domain/shortlist-view.js';
import { MatchResultsRepository } from '../infrastructure/match-results.repository.js';
import { PreferencesRepository } from '../infrastructure/preferences.repository.js';

/**
 * States a nomination moves its preference to: HR's decision (US-5.3 AC-5, AC-6), the interview
 * result, the offer's answer and the end of a reserve (US-5.4).
 */
export type ReviewedPreferenceStatus = Extract<
  ApplicationStatus,
  'INTERVIEW' | 'HR_REJECTED' | 'PASSED' | 'RESERVE' | 'INTERVIEW_FAILED' | 'ACCEPTED' | 'DECLINED' | 'CLOSED'
>;

type ScoredRow = ShortlistRow & {
  [K in 'criteria' | 'assessment' | 'scvBreakdown' | 'sCv']: NonNullable<ShortlistRow[K]>;
};

const isScored = (row: ShortlistRow): row is ScoredRow =>
  row.eligible && row.criteria !== null && row.assessment !== null && row.scvBreakdown !== null && row.sCv !== null;

/**
 * What HR review (US-5.3) needs of a nomination's preference, so the review module never reads
 * `core.preferences` or `core.match_results` itself (AGENTS › Invariant 13): the preference follows
 * its nomination, and HR reads the S_cv explanation of the pair from the stored result (NFR-4).
 */
@Injectable()
export class PreferenceReviewService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly repository: PreferencesRepository,
    private readonly results: MatchResultsRepository,
    private readonly cvs: CvService,
    private readonly transitions: StateTransitionService,
  ) {}

  /**
   * The preference follows its nomination (US-5.3 AC-5, AC-6; US-5.4 AC-3, AC-6, AC-7, AC-9), in
   * `tx`, under the preference's row lock, audited (AD-8). The student's other preferences already
   * wait for the next round since the round was published (US-5.2), so nothing else moves here.
   */
  async followNomination(
    preferenceId: number,
    to: ReviewedPreferenceStatus,
    actor: Actor,
    reason: string,
    options: { tx: DbTx },
  ): Promise<void> {
    const row = await this.repository.findRow(preferenceId, { tx: options.tx, lock: 'update' });
    if (!row) throw new EntityNotFoundError('application', preferenceId);
    await this.transitions.transitionTo({
      lifecycle: applicationLifecycle,
      id: preferenceId,
      to,
      actor,
      reason,
      expectedRowVersion: row.rowVersion,
      tx: options.tx,
    });
  }

  /**
   * BR-15 (US-5.4 AC-6): the student accepted an offer of the campaign, so every other preference of
   * theirs in it that can still close does (WAITING_NEXT_ROUND, PENDING_TEST → CLOSED), in `tx`, each
   * under its row lock and audited. Returns the ids closed.
   */
  async closeOtherPreferences(
    studentId: number,
    campaignId: number,
    keepPreferenceId: number,
    actor: Actor,
    reason: string,
    options: { tx: DbTx },
  ): Promise<number[]> {
    const closed: number[] = [];
    for (const row of await this.repository.rowsOfStudentInCampaign(options.tx, studentId, campaignId, { lock: 'update' })) {
      if (row.id === keepPreferenceId || !canTransition(applicationMachine, row.status, 'CLOSED')) continue;
      await this.transitions.transitionTo({
        lifecycle: applicationLifecycle,
        id: row.id,
        to: 'CLOSED',
        actor,
        reason,
        expectedRowVersion: row.rowVersion,
        tx: options.tx,
      });
      closed.push(row.id);
    }
    return closed;
  }

  /**
   * AC-2: the S_cv explanation of the pair: the newest scored result of the student's active CV for
   * the JD at a version up to the current one, with the campaign's rules and pinned prompt (LESSONS
   * §42). Null when there is none, e.g. the CV is gone.
   */
  async matchOf(preferenceId: number): Promise<NominationMatch | null> {
    const preference = await this.repository.findRow(preferenceId);
    if (!preference) return null;
    const cv = (await this.cvs.activeCvsOf(preference.studentId)).find((active) => active.campaignId === preference.campaignId);
    if (!cv) return null;
    const pinned = await this.results.pinnedPrompt(this.db, preference.campaignId);
    const rows = await this.results.listForShortlist(preference.campaignId, RULES_VERSION, pinned, [cv.cvId]);
    const [row] = rows
      .filter((candidate): candidate is ScoredRow => candidate.jdId === preference.jdId && candidate.cvVersion === cv.cvVersion && isScored(candidate))
      .sort((a, b) => b.jdVersion - a.jdVersion);
    if (!row) return null;
    const { criteria, assessment } = row;
    const project = assessment.project_relevance;
    // A quote the check did not find in the CV is flagged, as on the student's shortlist (CONTEXT D46).
    const matched = new Map(assessment.evidence_check.map((check) => [check.quote, check.matched]));
    return {
      sCv: row.sCv,
      breakdown: row.scvBreakdown,
      skills: { must_have: criteria.must_have, nice_to_have: criteria.nice_to_have },
      zones: criteria.zones,
      language: criteria.language,
      education: criteria.education,
      project: {
        score: project.score_0_4,
        reason: project.reason,
        quotes: project.evidence.map((quote) => ({ quote, matched: matched.get(quote) ?? false })),
      },
      gaps: criteria.gaps,
    };
  }
}
