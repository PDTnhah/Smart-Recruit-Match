import { Inject, Injectable } from '@nestjs/common';
import {
  type JdAnalysisStatus,
  type JdRequirements,
  jobDescriptionMachine,
  type JobDescriptionStatus,
  type PositionGroup,
  type WorkMode,
} from '@srm/shared';
import { and, desc, eq, inArray, isNotNull, type SQL, sql } from 'drizzle-orm';
import { RowVersionConflictError } from '../../../common/errors/index.js';
import { companies, jobDescriptions } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';

/** A JD version the Matching Agent scores against (US-3.2): approved, requirements confirmed. */
export interface ApprovedJd {
  jdId: number;
  jdVersion: number;
  positionGroup: PositionGroup;
  requirements: JdRequirements;
}

/** What the question bank of a JD reads (US-4.1): its state, current version and requirements. */
export interface QuestionBankJd {
  jdId: number;
  campaignId: number;
  jdVersion: number;
  status: JobDescriptionStatus;
  /** Null until HR confirms them, and before the JD Analyzer proposes them. */
  requirements: JdRequirements | null;
}

/** What a student's shortlist shows of a JD (US-3.3): the current version and its card. */
export interface ShortlistJdCard {
  jdId: number;
  jdVersion: number;
  title: string;
  companyName: string;
  positionGroup: PositionGroup | null;
  location: string | null;
  workMode: WorkMode | null;
  /** Places of the JD; the competition level of US-3.4 divides preferences by it. */
  quota: number;
}

/** Approved by the center and still taking students (BR-02); FILLED and CLOSED have no place left. */
const MATCHABLE_JD_STATES = ['APPROVED', 'RECRUITING'] as const satisfies readonly JobDescriptionStatus[];

/** Every JD once approved, the ones core.v_ai_jd_requirements shows the AI Service. */
const SCORED_JD_STATES = [...MATCHABLE_JD_STATES, 'FILLED', 'CLOSED'] as const satisfies readonly JobDescriptionStatus[];

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
  /** `requirements` is set (US-2.3); the JSON itself is read by `findWithRequirements`. */
  requirementsReady: boolean;
  positionGroup: PositionGroup | null;
  analysisStatus: JdAnalysisStatus | null;
  hiddenTextFlag: boolean;
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
  positionGroup: jobDescriptions.positionGroup,
  analysisStatus: jobDescriptions.analysisStatus,
  hiddenTextFlag: jobDescriptions.hiddenTextFlag,
  status: jobDescriptions.status,
  version: jobDescriptions.version,
  rowVersion: jobDescriptions.rowVersion,
  createdAt: jobDescriptions.createdAt,
  updatedAt: jobDescriptions.updatedAt,
};

/** A JD with its stored requirements JSON, unparsed: rows written before 0.9.0 may hold another shape. */
export interface JdRecordWithRequirements extends JdRecord {
  requirements: unknown;
}

export interface JdInsert extends JdContent {
  campaignId: number;
  companyId: number;
}

/** The normalised requirements and the AI analysis that proposed them (US-2.3, CONTEXT D35). */
export interface JdRequirementsChanges {
  requirements?: JdRequirements;
  positionGroup?: PositionGroup;
  version?: number;
  analysisStatus?: JdAnalysisStatus;
  analysisModel?: string;
  analysisPromptVersion?: string;
  hiddenTextFlag?: boolean;
}

/** Columns a versioned update may write. Never `status`: only `transitionTo` changes it (AD-8). */
export type JdChanges = Partial<JdContent> & { fileKey?: string; fileName?: string } & JdRequirementsChanges;

/**
 * Drizzle access to `core.job_descriptions` (and the company name next to it); both tables belong
 * to the company module (AGENTS › Invariant 13).
 */
@Injectable()
export class JdRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async listApproved(campaignId: number, withEnded: boolean): Promise<ApprovedJd[]> {
    const rows = await this.db
      .select({
        jdId: jobDescriptions.id,
        jdVersion: jobDescriptions.version,
        positionGroup: jobDescriptions.positionGroup,
        requirements: jobDescriptions.requirements,
      })
      .from(jobDescriptions)
      .where(
        and(
          eq(jobDescriptions.campaignId, campaignId),
          inArray(jobDescriptions.status, [...(withEnded ? SCORED_JD_STATES : MATCHABLE_JD_STATES)]),
          isNotNull(jobDescriptions.requirements),
        ),
      )
      .orderBy(jobDescriptions.id);
    // A JD without a position group is matched like OTHER: no major group fits it EXACT.
    return rows.flatMap(({ requirements, positionGroup, ...row }) =>
      requirements === null ? [] : [{ ...row, positionGroup: positionGroup ?? 'OTHER', requirements }],
    );
  }

  async findForQuestionBank(id: number, options: { tx?: DbTx; lock?: 'share' } = {}): Promise<QuestionBankJd | undefined> {
    const query = (options.tx ?? this.db)
      .select({
        jdId: jobDescriptions.id,
        campaignId: jobDescriptions.campaignId,
        jdVersion: jobDescriptions.version,
        status: jobDescriptions.status,
        requirements: jobDescriptions.requirements,
      })
      .from(jobDescriptions)
      .where(eq(jobDescriptions.id, id));
    const [row] = options.lock ? await query.for(options.lock) : await query;
    return row;
  }

  /** The JDs `listApproved` returns without `withEnded`, with their company, by JD id (US-3.3). */
  async listShortlistCards(campaignId: number): Promise<ShortlistJdCard[]> {
    return this.db
      .select({
        jdId: jobDescriptions.id,
        jdVersion: jobDescriptions.version,
        title: jobDescriptions.title,
        companyName: companies.name,
        positionGroup: jobDescriptions.positionGroup,
        location: jobDescriptions.location,
        workMode: jobDescriptions.workMode,
        quota: jobDescriptions.quota,
      })
      .from(jobDescriptions)
      .innerJoin(companies, eq(companies.id, jobDescriptions.companyId))
      .where(
        and(
          eq(jobDescriptions.campaignId, campaignId),
          inArray(jobDescriptions.status, [...MATCHABLE_JD_STATES]),
          isNotNull(jobDescriptions.requirements),
        ),
      )
      .orderBy(jobDescriptions.id);
  }

  /** The cards of these JDs whatever their state, with their company, by JD id (US-4.3). */
  async listCardsByIds(jdIds: readonly number[]): Promise<ShortlistJdCard[]> {
    if (jdIds.length === 0) return [];
    return this.db
      .select({
        jdId: jobDescriptions.id,
        jdVersion: jobDescriptions.version,
        title: jobDescriptions.title,
        companyName: companies.name,
        positionGroup: jobDescriptions.positionGroup,
        location: jobDescriptions.location,
        workMode: jobDescriptions.workMode,
        quota: jobDescriptions.quota,
      })
      .from(jobDescriptions)
      .innerJoin(companies, eq(companies.id, jobDescriptions.companyId))
      .where(inArray(jobDescriptions.id, [...jdIds]))
      .orderBy(jobDescriptions.id);
  }

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
    if (options.lock) await lockRow(db, id);
    const [row] = await db
      .select(RECORD_COLUMNS)
      .from(jobDescriptions)
      .innerJoin(companies, eq(companies.id, jobDescriptions.companyId))
      .where(eq(jobDescriptions.id, id));
    return row;
  }

  /** As `findById`, with the requirements JSON read in the same query (US-2.3). */
  async findWithRequirements(
    id: number,
    options: { tx?: DbTx; lock?: 'update' } = {},
  ): Promise<JdRecordWithRequirements | undefined> {
    const db = options.tx ?? this.db;
    if (options.lock) await lockRow(db, id);
    const [row] = await db
      .select({ ...RECORD_COLUMNS, requirements: jobDescriptions.requirements })
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

/** Locks the JD row alone: `FOR UPDATE OF` with a join is refused for `core` tables (LESSONS §12). */
async function lockRow(db: Database | DbTx, id: number): Promise<void> {
  await db.select({ id: jobDescriptions.id }).from(jobDescriptions).where(eq(jobDescriptions.id, id)).for('update');
}
