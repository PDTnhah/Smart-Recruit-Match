import { Inject, Injectable } from '@nestjs/common';
import { jobDescriptionMachine, type JobDescriptionStatus, type WorkMode } from '@srm/shared';
import { and, desc, eq, type SQL, sql } from 'drizzle-orm';
import { RowVersionConflictError } from '../../../common/errors/index.js';
import { companies, jobDescriptions } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';

/** The JD fields HR enters (FR-4); `rawText` holds the typed description. */
export interface JdContent {
  title: string;
  quota: number;
  location: string | null;
  workMode: WorkMode | null;
  internshipPeriod: string | null;
  allowance: string | null;
  rawText: string | null;
}

export interface JdRecord extends JdContent {
  id: number;
  campaignId: number;
  companyId: number;
  companyName: string;
  fileKey: string | null;
  fileName: string | null;
  /** `requirements` is set (US-2.3); the JSON itself is not read here. */
  requirementsReady: boolean;
  status: JobDescriptionStatus;
  version: number;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const RECORD_COLUMNS = {
  id: jobDescriptions.id,
  campaignId: jobDescriptions.campaignId,
  companyId: jobDescriptions.companyId,
  companyName: companies.name,
  title: jobDescriptions.title,
  quota: jobDescriptions.quota,
  location: jobDescriptions.location,
  workMode: jobDescriptions.workMode,
  internshipPeriod: jobDescriptions.internshipPeriod,
  allowance: jobDescriptions.allowance,
  rawText: jobDescriptions.rawText,
  fileKey: jobDescriptions.fileKey,
  fileName: jobDescriptions.fileName,
  requirementsReady: sql<boolean>`${jobDescriptions.requirements} is not null`,
  status: jobDescriptions.status,
  version: jobDescriptions.version,
  rowVersion: jobDescriptions.rowVersion,
  createdAt: jobDescriptions.createdAt,
  updatedAt: jobDescriptions.updatedAt,
};

export interface JdInsert extends JdContent {
  campaignId: number;
  companyId: number;
}

/** Columns a versioned update may write. Never `status`: only `transitionTo` changes it (AD-8). */
export type JdChanges = Partial<JdContent> & { fileKey?: string; fileName?: string };

/**
 * Drizzle access to `core.job_descriptions` (and the company name next to it); both tables belong
 * to the company module (AGENTS › Invariant 13).
 */
@Injectable()
export class JdRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async insert(tx: DbTx, values: JdInsert): Promise<number> {
    const [row] = await tx.insert(jobDescriptions).values(values).returning({ id: jobDescriptions.id });
    if (!row) throw new Error('insert into job_descriptions returned no row');
    return row.id;
  }

  /**
   * With `lock` (inside `tx`), the JD row is locked first by a query of its own: the joined read
   * cannot use `FOR UPDATE OF`, which PostgreSQL refuses for schema-qualified names, and a plain
   * `FOR UPDATE` would also lock the company row.
   */
  async findById(id: number, options: { tx?: DbTx; lock?: 'update' } = {}): Promise<JdRecord | undefined> {
    const db = options.tx ?? this.db;
    if (options.lock) {
      await db.select({ id: jobDescriptions.id }).from(jobDescriptions).where(eq(jobDescriptions.id, id)).for(options.lock);
    }
    const [row] = await db
      .select(RECORD_COLUMNS)
      .from(jobDescriptions)
      .innerJoin(companies, eq(companies.id, jobDescriptions.companyId))
      .where(eq(jobDescriptions.id, id));
    return row;
  }

  /** Newest first; `where` already holds the caller's scope and filters. */
  list(where: SQL | undefined): Promise<JdRecord[]> {
    return this.db
      .select(RECORD_COLUMNS)
      .from(jobDescriptions)
      .innerJoin(companies, eq(companies.id, jobDescriptions.companyId))
      .where(where)
      .orderBy(desc(jobDescriptions.id));
  }

  /** Writes with `WHERE row_version = n` and bumps it; a lost race is a 409. */
  async updateVersioned(tx: DbTx, id: number, expectedRowVersion: number, changes: JdChanges): Promise<void> {
    const updated = await tx
      .update(jobDescriptions)
      .set({ ...changes, rowVersion: expectedRowVersion + 1 })
      .where(and(eq(jobDescriptions.id, id), eq(jobDescriptions.rowVersion, expectedRowVersion)))
      .returning({ id: jobDescriptions.id });
    if (updated.length === 0) throw new RowVersionConflictError(jobDescriptionMachine.name, id, expectedRowVersion);
  }
}
