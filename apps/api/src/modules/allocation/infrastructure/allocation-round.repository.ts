import { Inject, Injectable } from '@nestjs/common';
import {
  type AllocationRoundStatus,
  NOMINATION_INVITED_STATES,
  type NominationAdjustment,
  type NominationStatus,
} from '@srm/shared';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { RowVersionConflictError } from '../../../common/errors/index.js';
import { allocationRounds, nominations } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import type { AllocationConfigSnapshot, AllocationInputSnapshot, StoredEngineResult } from '../domain/index.js';

/** Audit entity of a round: the name of `allocationRoundMachine`. */
export const ROUND_ENTITY = 'allocation_round';

/** One manual change of a draft, as `allocation_rounds.adjustments` keeps it (BR-10). */
export interface StoredAdjustment {
  op: NominationAdjustment['op'];
  studentId: number;
  fromJdId: number | null;
  toJdId: number | null;
  reason: string;
  actorId: number | null;
  at: string;
}

export interface RoundRecord {
  id: number;
  campaignId: number;
  roundNo: number;
  status: AllocationRoundStatus;
  inputSnapshot: AllocationInputSnapshot;
  configSnapshot: AllocationConfigSnapshot;
  engineResult: StoredEngineResult;
  adjustments: StoredAdjustment[];
  ranAt: Date;
  publishedAt: Date | null;
  rowVersion: number;
}

export interface NominationRecord {
  id: number;
  roundId: number;
  campaignId: number;
  studentId: number;
  jdId: number;
  preferenceId: number;
  sFinal: number;
  rank: number;
  status: NominationStatus;
  overrideReason: string | null;
  rowVersion: number;
}

export type NewNomination = Omit<NominationRecord, 'id' | 'status' | 'rowVersion'>;

/** A nomination of a published round, with the round it came from (US-5.3). */
export interface PublishedNominationRecord extends NominationRecord {
  roundNo: number;
  publishedAt: Date;
}

/** The nominations of one JD in one published round, for HR's deadline (US-5.3 AC-10). */
export interface ReviewGroupRecord {
  roundId: number;
  roundNo: number;
  campaignId: number;
  publishedAt: Date;
  jdId: number;
  nominationCount: number;
  /** Still NOMINATED: HR has not decided on them. */
  pendingCount: number;
}

/** A published round, without its snapshots. */
export interface PublishedRoundRecord {
  id: number;
  campaignId: number;
  roundNo: number;
  publishedAt: Date;
}

export interface RoundContent {
  inputSnapshot: AllocationInputSnapshot;
  configSnapshot: AllocationConfigSnapshot;
  engineResult: StoredEngineResult;
  ranAt: Date;
  ranBy: number | null;
}

const ROUND_COLUMNS = {
  id: allocationRounds.id,
  campaignId: allocationRounds.campaignId,
  roundNo: allocationRounds.roundNo,
  status: allocationRounds.status,
  inputSnapshot: allocationRounds.inputSnapshot,
  configSnapshot: allocationRounds.configSnapshot,
  engineResult: allocationRounds.engineResult,
  adjustments: allocationRounds.adjustments,
  ranAt: allocationRounds.ranAt,
  publishedAt: allocationRounds.publishedAt,
  rowVersion: allocationRounds.rowVersion,
};

const NOMINATION_COLUMNS = {
  id: nominations.id,
  roundId: nominations.roundId,
  campaignId: nominations.campaignId,
  studentId: nominations.studentId,
  jdId: nominations.jdId,
  preferenceId: nominations.preferenceId,
  sFinal: nominations.sFinal,
  rank: nominations.rank,
  status: nominations.status,
  overrideReason: nominations.overrideReason,
  rowVersion: nominations.rowVersion,
};

/** A published round always has `published_at` (CHECK `allocation_rounds_published_check`). */
const published = (row: NominationRecord & { roundNo: number; publishedAt: Date | null }): PublishedNominationRecord => ({
  ...row,
  publishedAt: row.publishedAt!,
});

/** Rows written per statement. */
const CHUNK = 500;

/** The JSONB columns hold the domain's snapshot types; Drizzle only knows them as JSON objects. */
const toRound = (row: Record<keyof typeof ROUND_COLUMNS, unknown>): RoundRecord => row as unknown as RoundRecord;

const contentColumns = (content: RoundContent) => ({
  inputSnapshot: content.inputSnapshot as unknown as Record<string, unknown>,
  configSnapshot: content.configSnapshot as unknown as Record<string, unknown>,
  engineResult: content.engineResult as unknown as Record<string, unknown>,
  ranAt: content.ranAt,
  ranBy: content.ranBy,
});

/**
 * Drizzle access to `core.allocation_rounds` and `core.nominations`, both owned by the allocation
 * module (CONTEXT D64, AGENTS › Invariant 13). Every UPDATE takes a new row version (LESSONS §43).
 */
@Injectable()
export class AllocationRoundRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** `FOR UPDATE` when `lock` is set, inside `tx`. */
  async findRound(id: number, options: { tx?: DbTx; lock?: 'update' } = {}): Promise<RoundRecord | undefined> {
    const query = (options.tx ?? this.db).select(ROUND_COLUMNS).from(allocationRounds).where(eq(allocationRounds.id, id));
    const [row] = options.lock ? await query.for(options.lock) : await query;
    return row && toRound(row);
  }

  /** The campaign of a round, read without a lock (it never changes). */
  async campaignOf(tx: DbTx, id: number): Promise<number | undefined> {
    const [row] = await tx
      .select({ campaignId: allocationRounds.campaignId })
      .from(allocationRounds)
      .where(eq(allocationRounds.id, id));
    return row?.campaignId;
  }

  async findByRoundNo(tx: DbTx, campaignId: number, roundNo: number): Promise<RoundRecord | undefined> {
    const [row] = await tx
      .select(ROUND_COLUMNS)
      .from(allocationRounds)
      .where(and(eq(allocationRounds.campaignId, campaignId), eq(allocationRounds.roundNo, roundNo)))
      .for('update');
    return row && toRound(row);
  }

  /** Round 1 first. */
  async listByCampaign(campaignId: number): Promise<RoundRecord[]> {
    const rows = await this.db
      .select(ROUND_COLUMNS)
      .from(allocationRounds)
      .where(eq(allocationRounds.campaignId, campaignId))
      .orderBy(asc(allocationRounds.roundNo));
    return rows.map(toRound);
  }

  /**
   * Published rounds whose snapshot names the student, newest first (US-5.2 AC-12): a student
   * without any preference in a round has nothing to read there.
   */
  async listPublishedOfStudent(studentId: number): Promise<RoundRecord[]> {
    const named = JSON.stringify([{ studentId: String(studentId) }]);
    const rows = await this.db
      .select(ROUND_COLUMNS)
      .from(allocationRounds)
      .where(
        and(
          eq(allocationRounds.status, 'PUBLISHED'),
          sql`(${allocationRounds.inputSnapshot} -> 'pairs' @> ${named}::jsonb or ${allocationRounds.inputSnapshot} -> 'excluded' @> ${named}::jsonb)`,
        ),
      )
      .orderBy(sql`${allocationRounds.publishedAt} desc`, sql`${allocationRounds.id} desc`);
    return rows.map(toRound);
  }

  async insertRound(tx: DbTx, campaignId: number, roundNo: number, content: RoundContent): Promise<number> {
    const [row] = await tx
      .insert(allocationRounds)
      .values({ campaignId, roundNo, ...contentColumns(content), adjustments: [] })
      .returning({ id: allocationRounds.id });
    if (!row) throw new Error('insert into allocation_rounds returned no row');
    return row.id;
  }

  /** A draft run again (AC-6): new snapshots and result, no adjustments left. */
  async replaceDraft(tx: DbTx, round: RoundRecord, content: RoundContent): Promise<void> {
    await this.update(tx, round, { ...contentColumns(content), adjustments: [] });
  }

  async saveAdjustments(tx: DbTx, round: RoundRecord, adjustments: StoredAdjustment[]): Promise<void> {
    await this.update(tx, round, { adjustments: adjustments as unknown as Record<string, unknown>[] });
  }

  async nominationsOf(roundId: number, tx: DbTx | Database = this.db): Promise<NominationRecord[]> {
    return tx
      .select(NOMINATION_COLUMNS)
      .from(nominations)
      .where(eq(nominations.roundId, roundId))
      .orderBy(asc(nominations.jdId), asc(nominations.rank), asc(nominations.id));
  }

  async deleteNominations(tx: DbTx, roundId: number): Promise<void> {
    await tx.delete(nominations).where(eq(nominations.roundId, roundId));
  }

  async insertNominations(tx: DbTx, rows: readonly NewNomination[]): Promise<void> {
    for (let start = 0; start < rows.length; start += CHUNK) {
      await tx.insert(nominations).values(rows.slice(start, start + CHUNK));
    }
  }

  async insertNomination(tx: DbTx, row: NewNomination): Promise<number> {
    const [inserted] = await tx.insert(nominations).values(row).returning({ id: nominations.id });
    if (!inserted) throw new Error('insert into nominations returned no row');
    return inserted.id;
  }

  async deleteNomination(tx: DbTx, id: number): Promise<void> {
    await tx.delete(nominations).where(eq(nominations.id, id));
  }

  /** A nomination moved to another JD of the student (AC-8). */
  async moveNomination(
    tx: DbTx,
    id: number,
    values: Pick<NominationRecord, 'jdId' | 'preferenceId' | 'sFinal' | 'rank' | 'overrideReason'>,
  ): Promise<void> {
    await tx
      .update(nominations)
      .set({ ...values, rowVersion: sql`${nominations.rowVersion} + 1` })
      .where(eq(nominations.id, id));
  }

  async setRank(tx: DbTx, id: number, rank: number): Promise<void> {
    await tx
      .update(nominations)
      .set({ rank, rowVersion: sql`${nominations.rowVersion} + 1` })
      .where(eq(nominations.id, id));
  }

  /** Nominations of the JD in every PUBLISHED round (US-5.3 AC-1); drafts never show. Read in `tx` when given. */
  async publishedNominationsOfJd(jdId: number, tx: DbTx | Database = this.db): Promise<PublishedNominationRecord[]> {
    const rows = await tx
      .select({ ...NOMINATION_COLUMNS, roundNo: allocationRounds.roundNo, publishedAt: allocationRounds.publishedAt })
      .from(nominations)
      .innerJoin(allocationRounds, eq(allocationRounds.id, nominations.roundId))
      .where(and(eq(nominations.jdId, jdId), eq(allocationRounds.status, 'PUBLISHED')))
      .orderBy(asc(allocationRounds.roundNo), asc(nominations.rank), asc(nominations.id));
    return rows.map(published);
  }

  /** The student's nominations in published rounds, newest first (US-5.4: interviews and offers). */
  async publishedNominationsOfStudent(studentId: number): Promise<PublishedNominationRecord[]> {
    const rows = await this.db
      .select({ ...NOMINATION_COLUMNS, roundNo: allocationRounds.roundNo, publishedAt: allocationRounds.publishedAt })
      .from(nominations)
      .innerJoin(allocationRounds, eq(allocationRounds.id, nominations.roundId))
      .where(and(eq(nominations.studentId, studentId), eq(allocationRounds.status, 'PUBLISHED')))
      .orderBy(desc(nominations.id));
    return rows.map(published);
  }

  /** Nominations of published rounds in `status`, by id (US-5.4: the reserve sweep). */
  async publishedNominationsInStatus(status: NominationStatus): Promise<PublishedNominationRecord[]> {
    const rows = await this.db
      .select({ ...NOMINATION_COLUMNS, roundNo: allocationRounds.roundNo, publishedAt: allocationRounds.publishedAt })
      .from(nominations)
      .innerJoin(allocationRounds, eq(allocationRounds.id, nominations.roundId))
      .where(and(eq(nominations.status, status), eq(allocationRounds.status, 'PUBLISHED')))
      .orderBy(asc(nominations.id));
    return rows.map(published);
  }

  /** Nominations of the JD per status, in published rounds (US-5.4, BR-14). */
  async countByStatus(tx: DbTx | Database, jdId: number): Promise<Map<NominationStatus, number>> {
    const rows = await tx
      .select({ status: nominations.status, count: sql<number>`count(*)::int` })
      .from(nominations)
      .innerJoin(allocationRounds, eq(allocationRounds.id, nominations.roundId))
      .where(and(eq(nominations.jdId, jdId), eq(allocationRounds.status, 'PUBLISHED')))
      .groupBy(nominations.status);
    return new Map(rows.map((row) => [row.status, row.count]));
  }

  /**
   * A nomination of a PUBLISHED round; undefined for a draft's or a missing one (US-5.3 AC-3). With
   * `lock`, the nomination row is locked first by a statement without join (LESSONS §12).
   */
  async findPublishedNomination(
    id: number,
    options: { tx?: DbTx; lock?: 'update' } = {},
  ): Promise<PublishedNominationRecord | undefined> {
    const db = options.tx ?? this.db;
    if (options.lock) {
      const [locked] = await db.select({ id: nominations.id }).from(nominations).where(eq(nominations.id, id)).for(options.lock);
      if (!locked) return undefined;
    }
    const [row] = await db
      .select({ ...NOMINATION_COLUMNS, roundNo: allocationRounds.roundNo, publishedAt: allocationRounds.publishedAt })
      .from(nominations)
      .innerJoin(allocationRounds, eq(allocationRounds.id, nominations.roundId))
      .where(and(eq(nominations.id, id), eq(allocationRounds.status, 'PUBLISHED')));
    return row && published(row);
  }

  /** Ids of the student's nominations in published rounds, newest first (US-5.3 AC-6). */
  async publishedNominationIdsOfStudent(studentId: number): Promise<number[]> {
    const rows = await this.db
      .select({ id: nominations.id })
      .from(nominations)
      .innerJoin(allocationRounds, eq(allocationRounds.id, nominations.roundId))
      .where(and(eq(nominations.studentId, studentId), eq(allocationRounds.status, 'PUBLISHED')))
      .orderBy(desc(nominations.id));
    return rows.map((row) => row.id);
  }

  /** Nominations of the JD HR has invited, in published rounds (US-5.3 AC-9). */
  async countInvited(tx: DbTx | Database, jdId: number): Promise<number> {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(nominations)
      .innerJoin(allocationRounds, eq(allocationRounds.id, nominations.roundId))
      .where(
        and(
          eq(nominations.jdId, jdId),
          eq(allocationRounds.status, 'PUBLISHED'),
          inArray(nominations.status, [...NOMINATION_INVITED_STATES]),
        ),
      );
    return row?.count ?? 0;
  }

  /** The campaign's newest published round; undefined before the first is published. */
  async latestPublishedRound(tx: DbTx | Database, campaignId: number): Promise<PublishedRoundRecord | undefined> {
    const [row] = await tx
      .select({
        id: allocationRounds.id,
        campaignId: allocationRounds.campaignId,
        roundNo: allocationRounds.roundNo,
        publishedAt: allocationRounds.publishedAt,
      })
      .from(allocationRounds)
      .where(and(eq(allocationRounds.campaignId, campaignId), eq(allocationRounds.status, 'PUBLISHED')))
      .orderBy(desc(allocationRounds.roundNo))
      .limit(1);
    return row && { ...row, publishedAt: row.publishedAt! };
  }

  /**
   * Nominations of published rounds counted per round and JD (US-5.3 AC-10): one round, or with
   * `pendingOnly` every group that still has a NOMINATED one (the SLA sweep).
   */
  async reviewGroups(filter: { roundId?: number; pendingOnly?: boolean }): Promise<ReviewGroupRecord[]> {
    const pending = sql<number>`(count(*) filter (where ${nominations.status} = 'NOMINATED'))::int`;
    const rows = await this.db
      .select({
        roundId: allocationRounds.id,
        roundNo: allocationRounds.roundNo,
        campaignId: allocationRounds.campaignId,
        publishedAt: allocationRounds.publishedAt,
        jdId: nominations.jdId,
        nominationCount: sql<number>`count(*)::int`,
        pendingCount: pending,
      })
      .from(nominations)
      .innerJoin(allocationRounds, eq(allocationRounds.id, nominations.roundId))
      .where(
        and(
          eq(allocationRounds.status, 'PUBLISHED'),
          filter.roundId === undefined ? undefined : eq(allocationRounds.id, filter.roundId),
        ),
      )
      .groupBy(allocationRounds.id, nominations.jdId)
      .having(filter.pendingOnly ? sql`${pending} > 0` : undefined)
      .orderBy(asc(allocationRounds.id), asc(nominations.jdId));
    return rows.map((row) => ({ ...row, publishedAt: row.publishedAt! }));
  }

  private async update(tx: DbTx, round: RoundRecord, values: Partial<typeof allocationRounds.$inferInsert>): Promise<void> {
    const updated = await tx
      .update(allocationRounds)
      .set({ ...values, rowVersion: round.rowVersion + 1 })
      .where(and(eq(allocationRounds.id, round.id), eq(allocationRounds.rowVersion, round.rowVersion)))
      .returning({ id: allocationRounds.id });
    if (updated.length === 0) throw new RowVersionConflictError(ROUND_ENTITY, round.id, round.rowVersion);
  }
}
