import { Inject, Injectable } from '@nestjs/common';
import type { HrDecision, HrRejectReason } from '@srm/shared';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { hrReviews, reviewDeadlineExtensions, supplementRequests } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';

export interface HrReviewRecord {
  nominationId: number;
  reviewerId: number;
  decision: HrDecision;
  reasonCode: HrRejectReason | null;
  note: string | null;
  decidedAt: Date;
}

export type SupplementRequestRecord = typeof supplementRequests.$inferSelect;

export type NewSupplementRequest = Omit<SupplementRequestRecord, 'id'>;

export type NewDeadlineExtension = Omit<typeof reviewDeadlineExtensions.$inferInsert, 'id'>;

/** `${roundId}:${jdId}`: one HR deadline. */
export const deadlineKey = (roundId: number, jdId: number) => `${roundId}:${jdId}`;

const REVIEW_COLUMNS = {
  nominationId: hrReviews.nominationId,
  reviewerId: hrReviews.reviewerId,
  decision: hrReviews.decision,
  reasonCode: hrReviews.reasonCode,
  note: hrReviews.note,
  decidedAt: hrReviews.decidedAt,
};

/**
 * Drizzle access to `core.hr_reviews`, `core.supplement_requests` and
 * `core.review_deadline_extensions`, owned by the review module (AGENTS › Invariant 13). The rows
 * are only ever inserted.
 */
@Injectable()
export class ReviewRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Throws on a second review of the nomination (`hr_reviews_nomination_id_key`, AC-7). */
  async insertReview(tx: DbTx, row: HrReviewRecord): Promise<void> {
    await tx.insert(hrReviews).values(row);
  }

  /** Reviews of the nominations, by nomination id. */
  async reviewsOf(nominationIds: readonly number[]): Promise<Map<number, HrReviewRecord>> {
    if (nominationIds.length === 0) return new Map();
    const rows = await this.db.select(REVIEW_COLUMNS).from(hrReviews).where(inArray(hrReviews.nominationId, [...nominationIds]));
    return new Map(rows.map((row) => [row.nominationId, row]));
  }

  /** Throws on a second request for the JD in the round (`supplement_requests_round_jd_key`). */
  async insertSupplement(tx: DbTx, row: NewSupplementRequest): Promise<SupplementRequestRecord> {
    const [inserted] = await tx.insert(supplementRequests).values(row).returning();
    if (!inserted) throw new Error('insert into supplement_requests returned no row');
    return inserted;
  }

  async findSupplement(roundId: number, jdId: number): Promise<SupplementRequestRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(supplementRequests)
      .where(and(eq(supplementRequests.roundId, roundId), eq(supplementRequests.jdId, jdId)));
    return row;
  }

  /** The campaign's requests, oldest first (US-5.5). */
  async supplementsOfCampaign(campaignId: number): Promise<SupplementRequestRecord[]> {
    return this.db
      .select()
      .from(supplementRequests)
      .where(eq(supplementRequests.campaignId, campaignId))
      .orderBy(supplementRequests.id);
  }

  async insertExtension(tx: DbTx, row: NewDeadlineExtension): Promise<void> {
    await tx.insert(reviewDeadlineExtensions).values(row);
  }

  /**
   * The deadline the extensions of each `(roundId, jdId)` set, by `deadlineKey`; pairs without one
   * are absent. Each extension must be later than the deadline before it, so the furthest is the
   * newest; taking the furthest also keeps two extensions that raced from moving the deadline back.
   */
  async latestExtensions(
    pairs: readonly { roundId: number; jdId: number }[],
    tx: DbTx | Database = this.db,
  ): Promise<Map<string, Date>> {
    if (pairs.length === 0) return new Map();
    const rows = await tx
      .select({ roundId: reviewDeadlineExtensions.roundId, jdId: reviewDeadlineExtensions.jdId, dueAt: reviewDeadlineExtensions.dueAt })
      .from(reviewDeadlineExtensions)
      .where(or(...pairs.map((pair) => and(eq(reviewDeadlineExtensions.roundId, pair.roundId), eq(reviewDeadlineExtensions.jdId, pair.jdId)))))
      .orderBy(desc(reviewDeadlineExtensions.dueAt));
    const latest = new Map<string, Date>();
    for (const row of rows) {
      const key = deadlineKey(row.roundId, row.jdId);
      if (!latest.has(key)) latest.set(key, row.dueAt);
    }
    return latest;
  }
}
