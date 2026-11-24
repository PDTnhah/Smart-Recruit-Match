import { Inject, Injectable } from '@nestjs/common';
import type { HrDecisionRequest, HrDecisionResult } from '@srm/shared';
import type { AuthUser } from '../../../common/auth/index.js';
import { Clock } from '../../../common/clock/index.js';
import { NominationAlreadyDecidedError, RowVersionConflictError } from '../../../common/errors/index.js';
import { uniqueViolation } from '../../../db/errors.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { NominationService } from '../../allocation/index.js';
import { AuditService, userActor } from '../../audit/index.js';
import { CampaignService } from '../../campaign/index.js';
import { PreferenceReviewService } from '../../matching/index.js';
import { DECISION_REASON, DECISION_TARGET, NOMINATION_ENTITY, REVIEW_AUDIT_ACTIONS, REVIEW_PHASES } from '../domain/audit-actions.js';
import { ReviewRepository } from '../infrastructure/review.repository.js';
import { NominationQueryService } from './nomination-query.service.js';

/**
 * HR's decision on a nomination (GĐ8 step 2, FR-29, US-5.3 AC-5–AC-8, BR-12, BR-13): invite to an
 * interview, or reject with a catalogue reason and a note. Only an HR user reaches it (the route is
 * `@Roles('HR')`); no code path decides by itself, and a passed deadline decides nothing.
 */
@Injectable()
export class HrDecisionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly clock: Clock,
    private readonly repository: ReviewRepository,
    private readonly query: NominationQueryService,
    private readonly nominations: NominationService,
    private readonly preferences: PreferenceReviewService,
    private readonly campaigns: CampaignService,
    private readonly audit: AuditService,
  ) {}

  /**
   * In one transaction (AD-8, Invariant 10): the campaign is in review (`FOR SHARE`), the
   * nomination is HR's own (404, BR-11) and locked, at the row version HR read (409 when another
   * decision won) and still NOMINATED (409 otherwise); it moves to INTERVIEW or HR_REJECTED, its
   * preference follows, `hr_reviews` gets the
   * decision (unique per nomination), and the audit. Locks go campaign → nomination → preference,
   * the order a round's publication takes them. The response comes from the transaction (LESSONS §44).
   */
  async decide(user: AuthUser, nominationId: number, request: HrDecisionRequest): Promise<HrDecisionResult> {
    const { nomination } = await this.query.requireOwn(user, nominationId); // 404 before any lock
    const actor = userActor(user);
    const to = DECISION_TARGET[request.decision];
    const reason = DECISION_REASON[request.decision];
    // The schema requires both for REJECT; an invitation keeps neither.
    const reasonCode = request.decision === 'REJECT' ? (request.reasonCode ?? null) : null;
    const note = request.decision === 'REJECT' ? (request.note ?? null) : null;
    return this.db.transaction(async (tx) => {
      await this.campaigns.assertPhase(nomination.campaignId, REVIEW_PHASES, { tx });
      const { nomination: locked } = await this.query.requireOwn(user, nominationId, { tx, lock: 'update' });
      // AC-7: the version first, so the loser of two concurrent decisions hears it lost the race.
      if (locked.rowVersion !== request.rowVersion) {
        throw new RowVersionConflictError(NOMINATION_ENTITY, locked.id, request.rowVersion, locked.rowVersion);
      }
      if (locked.status !== 'NOMINATED') throw new NominationAlreadyDecidedError(locked.id, locked.status);
      const rowVersion = await this.nominations.transition(locked.id, to, request.rowVersion, actor, reason, { tx });
      await this.preferences.followNomination(locked.preferenceId, to, actor, reason, { tx });
      const decidedAt = this.clock.now();
      try {
        await this.repository.insertReview(tx, {
          nominationId: locked.id,
          reviewerId: user.userId,
          decision: request.decision,
          reasonCode,
          note,
          decidedAt,
        });
      } catch (error) {
        // The state table already refuses a second decision; this is the database's backstop (AC-7).
        if (uniqueViolation(error) === 'hr_reviews_nomination_id_key') {
          throw new NominationAlreadyDecidedError(locked.id, locked.status);
        }
        throw error;
      }
      await this.audit.record(tx, {
        actor,
        action: REVIEW_AUDIT_ACTIONS.HR_DECISION,
        entity: NOMINATION_ENTITY,
        entityId: locked.id,
        // HR's note stays in hr_reviews: the audit log is append-only (NFR-2).
        after: { decision: request.decision, reasonCode },
        reason,
      });
      return {
        nominationId: locked.id,
        status: to,
        rowVersion,
        review: { decision: request.decision, reasonCode, note, decidedAt: decidedAt.toISOString() },
      };
    });
  }
}
