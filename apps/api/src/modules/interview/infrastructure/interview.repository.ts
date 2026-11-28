import { Inject, Injectable } from '@nestjs/common';
import type { InterviewMode, InterviewResult, InterviewStatus, OfferStatus } from '@srm/shared';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { RowVersionConflictError } from '../../../common/errors/index.js';
import { interviews, offers } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { INTERVIEW_ENTITY } from '../domain/audit-actions.js';

export interface InterviewRecord {
  id: number;
  nominationId: number;
  status: InterviewStatus;
  scheduledAt: Date;
  mode: InterviewMode;
  location: string;
  confirmedAt: Date | null;
  rescheduleRequestedAt: Date | null;
  rescheduleNote: string | null;
  result: InterviewResult | null;
  resultNote: string | null;
  resultAt: Date | null;
  rowVersion: number;
}

export interface OfferRecord {
  id: number;
  nominationId: number;
  status: OfferStatus;
  sentAt: Date;
  expiresAt: Date;
  respondedAt: Date | null;
  rowVersion: number;
}

const INTERVIEW_COLUMNS = {
  id: interviews.id,
  nominationId: interviews.nominationId,
  status: interviews.status,
  scheduledAt: interviews.scheduledAt,
  mode: interviews.mode,
  location: interviews.location,
  confirmedAt: interviews.confirmedAt,
  rescheduleRequestedAt: interviews.rescheduleRequestedAt,
  rescheduleNote: interviews.rescheduleNote,
  result: interviews.result,
  resultNote: interviews.resultNote,
  resultAt: interviews.resultAt,
  rowVersion: interviews.rowVersion,
};

const OFFER_COLUMNS = {
  id: offers.id,
  nominationId: offers.nominationId,
  status: offers.status,
  sentAt: offers.sentAt,
  expiresAt: offers.expiresAt,
  respondedAt: offers.respondedAt,
  rowVersion: offers.rowVersion,
};

/** Drizzle access to `core.interviews` and `core.offers`, owned by the interview module (Invariant 13). */
@Injectable()
export class InterviewRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async insertInterview(
    tx: DbTx,
    values: Pick<InterviewRecord, 'nominationId' | 'scheduledAt' | 'mode' | 'location'> & { createdBy: number; createdAt: Date },
  ): Promise<InterviewRecord> {
    const [row] = await tx
      .insert(interviews)
      .values({ ...values, status: 'SCHEDULED' })
      .returning(INTERVIEW_COLUMNS);
    if (!row) throw new Error('insert into interviews returned no row');
    return row;
  }

  /** One interview; with `lock`, its row `FOR UPDATE` in `tx`. */
  async findInterview(id: number, options: { tx?: DbTx; lock?: 'update' } = {}): Promise<InterviewRecord | undefined> {
    const query = (options.tx ?? this.db).select(INTERVIEW_COLUMNS).from(interviews).where(eq(interviews.id, id));
    const [row] = options.lock ? await query.for(options.lock) : await query;
    return row;
  }

  async interviewOfNomination(nominationId: number, tx: DbTx | Database = this.db): Promise<InterviewRecord | undefined> {
    const [row] = await tx.select(INTERVIEW_COLUMNS).from(interviews).where(eq(interviews.nominationId, nominationId));
    return row;
  }

  async interviewsOfNominations(nominationIds: readonly number[]): Promise<Map<number, InterviewRecord>> {
    if (nominationIds.length === 0) return new Map();
    const rows = await this.db.select(INTERVIEW_COLUMNS).from(interviews).where(inArray(interviews.nominationId, [...nominationIds]));
    return new Map(rows.map((row) => [row.nominationId, row]));
  }

  /**
   * A new time while the state stays SCHEDULED (AC-2): `UPDATE … WHERE row_version = n` (AD-8),
   * 409 when another write came first. Returns the new row version.
   */
  async updateSlot(
    tx: DbTx,
    id: number,
    expectedRowVersion: number,
    slot: Pick<InterviewRecord, 'scheduledAt' | 'mode' | 'location'>,
  ): Promise<number> {
    const [row] = await tx
      .update(interviews)
      .set({ ...slot, rowVersion: sql`${interviews.rowVersion} + 1` })
      .where(and(eq(interviews.id, id), eq(interviews.rowVersion, expectedRowVersion)))
      .returning({ rowVersion: interviews.rowVersion });
    if (!row) throw new RowVersionConflictError(INTERVIEW_ENTITY, id, expectedRowVersion);
    return row.rowVersion;
  }

  async insertOffer(tx: DbTx, values: Pick<OfferRecord, 'nominationId' | 'sentAt' | 'expiresAt'>): Promise<OfferRecord> {
    const [row] = await tx
      .insert(offers)
      .values({ ...values, status: 'PENDING' })
      .returning(OFFER_COLUMNS);
    if (!row) throw new Error('insert into offers returned no row');
    return row;
  }

  /** One offer; with `lock`, its row `FOR UPDATE` in `tx`. */
  async findOffer(id: number, options: { tx?: DbTx; lock?: 'update' } = {}): Promise<OfferRecord | undefined> {
    const query = (options.tx ?? this.db).select(OFFER_COLUMNS).from(offers).where(eq(offers.id, id));
    const [row] = options.lock ? await query.for(options.lock) : await query;
    return row;
  }

  async offersOfNominations(nominationIds: readonly number[]): Promise<Map<number, OfferRecord>> {
    if (nominationIds.length === 0) return new Map();
    const rows = await this.db.select(OFFER_COLUMNS).from(offers).where(inArray(offers.nominationId, [...nominationIds]));
    return new Map(rows.map((row) => [row.nominationId, row]));
  }

  /** PENDING offers past their deadline at `now`, oldest deadline first (AC-7 sweep). */
  async pendingOffersDue(now: Date): Promise<OfferRecord[]> {
    return this.db
      .select(OFFER_COLUMNS)
      .from(offers)
      .where(and(eq(offers.status, 'PENDING'), lte(offers.expiresAt, now)))
      .orderBy(asc(offers.expiresAt), asc(offers.id));
  }
}
