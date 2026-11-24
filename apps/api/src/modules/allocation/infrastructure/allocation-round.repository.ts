import { Inject, Injectable } from '@nestjs/common';
import type { AllocationRoundStatus, NominationAdjustment, NominationStatus } from '@srm/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
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

  private async update(tx: DbTx, round: RoundRecord, values: Partial<typeof allocationRounds.$inferInsert>): Promise<void> {
    const updated = await tx
      .update(allocationRounds)
      .set({ ...values, rowVersion: round.rowVersion + 1 })
      .where(and(eq(allocationRounds.id, round.id), eq(allocationRounds.rowVersion, round.rowVersion)))
      .returning({ id: allocationRounds.id });
    if (updated.length === 0) throw new RowVersionConflictError(ROUND_ENTITY, round.id, round.rowVersion);
  }
}
