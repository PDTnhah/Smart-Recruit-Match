import { Inject, Injectable } from '@nestjs/common';
import type { ReviewDeadline, ReviewDeadlineExtensionRequest, ReviewDeadlineList } from '@srm/shared';
import type { AuthUser } from '../../../common/auth/index.js';
import { Clock } from '../../../common/clock/index.js';
import { EntityNotFoundError, ReviewDeadlineNotLaterError } from '../../../common/errors/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { NominationService, type ReviewGroup } from '../../allocation/index.js';
import { AuditService, userActor } from '../../audit/index.js';
import { CampaignService } from '../../campaign/index.js';
import { type AllocationJd, JdService } from '../../company/index.js';
import { JD_ENTITY, REVIEW_AUDIT_ACTIONS, REVIEW_PHASES } from '../domain/audit-actions.js';
import { reviewDueAt } from '../domain/working-days.js';
import { deadlineKey, ReviewRepository } from '../infrastructure/review.repository.js';

/** Where a deadline is computed from: a published round and one of its JDs. */
export type DeadlineSource = Pick<ReviewGroup, 'roundId' | 'jdId' | 'campaignId' | 'publishedAt'>;

export interface Deadline {
  dueAt: Date;
  /** The center moved it (AC-10). */
  extended: boolean;
}

const ROUND_ENTITY = 'allocation_round';

/**
 * HR's deadline per round and JD (GĐ8 step 4, FR-29, US-5.3 AC-10, CONTEXT D65): `published_at` +
 * SLA_HR working days (`campaigns.config.sla_hr_business_days`, fixed from GĐ7 on), unless the
 * center extended it; the newest (and furthest) extension wins. Never computed or moved by an LLM
 * (Invariant 2).
 */
@Injectable()
export class ReviewDeadlineService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly clock: Clock,
    private readonly repository: ReviewRepository,
    private readonly nominations: NominationService,
    private readonly campaigns: CampaignService,
    private readonly jds: JdService,
    private readonly audit: AuditService,
  ) {}

  /** The deadline of each source, by `deadlineKey(roundId, jdId)`. */
  async deadlinesOf(sources: readonly DeadlineSource[], tx?: DbTx): Promise<Map<string, Deadline>> {
    const extensions = await this.repository.latestExtensions(sources, tx);
    const slaOf = new Map<number, number>();
    for (const campaignId of new Set(sources.map((source) => source.campaignId))) {
      slaOf.set(campaignId, (await this.campaigns.getSettings(campaignId)).config.sla_hr_business_days);
    }
    const deadlines = new Map<string, Deadline>();
    for (const source of sources) {
      const key = deadlineKey(source.roundId, source.jdId);
      const extended = extensions.get(key);
      deadlines.set(key, {
        dueAt: extended ?? reviewDueAt(source.publishedAt, slaOf.get(source.campaignId)!),
        extended: extended !== undefined,
      });
    }
    return deadlines;
  }

  /** `GET /api/allocation-rounds/{id}/review-deadlines` (CENTER): every JD of a published round. */
  async listForRound(roundId: number): Promise<ReviewDeadlineList> {
    const round = await this.nominations.findPublishedRound(roundId);
    if (!round) throw new EntityNotFoundError(ROUND_ENTITY, roundId);
    const groups = await this.nominations.reviewGroups({ roundId });
    const [deadlines, jds] = await Promise.all([this.deadlinesOf(groups), this.jdsOf(groups)]);
    const items = groups.map((group) => this.toView(group, deadlines.get(deadlineKey(group.roundId, group.jdId))!, jds));
    return { items: items.sort((a, b) => a.jdTitle.localeCompare(b.jdTitle, 'vi') || a.jdId - b.jdId) };
  }

  /**
   * AC-10: the center moves the deadline of a JD's nominations in a published round to a later
   * time, with a reason, audited; the next reminder and overdue notice use it (their dedupe keys
   * hold the deadline). Later than both now and the current deadline, else 422.
   */
  async extend(user: AuthUser, jdId: number, request: ReviewDeadlineExtensionRequest): Promise<ReviewDeadline> {
    const round = await this.nominations.findPublishedRound(request.roundId);
    if (!round) throw new EntityNotFoundError(ROUND_ENTITY, request.roundId);
    const group = (await this.nominations.reviewGroups({ roundId: round.id })).find((candidate) => candidate.jdId === jdId);
    // A JD without nominations in the round has no deadline there.
    if (!group) throw new EntityNotFoundError(JD_ENTITY, jdId);
    const jds = await this.jdsOf([group]);
    const dueAt = new Date(request.dueAt);
    return this.db.transaction(async (tx) => {
      await this.campaigns.assertPhase(round.campaignId, REVIEW_PHASES, { tx });
      const current = (await this.deadlinesOf([group], tx)).get(deadlineKey(round.id, jdId))!;
      if (dueAt.getTime() <= Math.max(current.dueAt.getTime(), this.clock.now().getTime())) {
        throw new ReviewDeadlineNotLaterError(round.id, jdId, current.dueAt);
      }
      await this.repository.insertExtension(tx, {
        roundId: round.id,
        jdId,
        dueAt,
        reason: request.reason,
        extendedBy: user.userId,
        createdAt: this.clock.now(),
      });
      await this.audit.record(tx, {
        actor: userActor(user),
        action: REVIEW_AUDIT_ACTIONS.DEADLINE_EXTENDED,
        entity: JD_ENTITY,
        entityId: jdId,
        before: { roundId: round.id, dueAt: current.dueAt.toISOString() },
        after: { roundId: round.id, dueAt: dueAt.toISOString() },
        reason: request.reason,
      });
      return this.toView(group, { dueAt, extended: true }, jds);
    });
  }

  private async jdsOf(groups: readonly ReviewGroup[]): Promise<Map<number, AllocationJd>> {
    const jds = await this.jds.listAllocationJds([...new Set(groups.map((group) => group.jdId))]);
    return new Map(jds.map((jd) => [jd.jdId, jd]));
  }

  private toView(group: ReviewGroup, deadline: Deadline, jds: ReadonlyMap<number, AllocationJd>): ReviewDeadline {
    const jd = jds.get(group.jdId);
    return {
      roundId: group.roundId,
      jdId: group.jdId,
      jdTitle: jd?.title ?? '',
      companyName: jd?.companyName ?? '',
      dueAt: deadline.dueAt.toISOString(),
      extended: deadline.extended,
      pendingCount: group.pendingCount,
      nominationCount: group.nominationCount,
    };
  }
}
