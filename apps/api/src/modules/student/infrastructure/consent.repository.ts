import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { consents } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';

export interface ConsentRecord {
  id: number;
  studentId: number;
  campaignId: number;
  termsVersion: number;
  termsSha256: string;
  acceptedAt: Date;
}

export type ConsentInsert = Omit<ConsentRecord, 'id'>;

const RECORD_COLUMNS = {
  id: consents.id,
  studentId: consents.studentId,
  campaignId: consents.campaignId,
  termsVersion: consents.termsVersion,
  termsSha256: consents.termsSha256,
  acceptedAt: consents.acceptedAt,
};

/** Drizzle access to `core.consents`, owned by the student module (AGENTS › Invariant 13). */
@Injectable()
export class ConsentRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  listByStudent(studentId: number): Promise<ConsentRecord[]> {
    return this.db
      .select(RECORD_COLUMNS)
      .from(consents)
      .where(eq(consents.studentId, studentId))
      .orderBy(asc(consents.campaignId), asc(consents.termsVersion));
  }

  async find(
    studentId: number,
    campaignId: number,
    termsVersion: number,
    tx: DbTx | Database = this.db,
  ): Promise<ConsentRecord | undefined> {
    const [row] = await tx
      .select(RECORD_COLUMNS)
      .from(consents)
      .where(
        and(
          eq(consents.studentId, studentId),
          eq(consents.campaignId, campaignId),
          eq(consents.termsVersion, termsVersion),
        ),
      );
    return row;
  }

  /** Inserts the consent; null when a concurrent request recorded the same one first. */
  async insert(tx: DbTx, values: ConsentInsert): Promise<ConsentRecord | null> {
    const [row] = await tx.insert(consents).values(values).onConflictDoNothing().returning(RECORD_COLUMNS);
    return row ?? null;
  }
}
