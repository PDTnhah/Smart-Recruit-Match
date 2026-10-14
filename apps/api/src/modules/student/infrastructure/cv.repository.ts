import { Inject, Injectable } from '@nestjs/common';
import type { CvStatus } from '@srm/shared';
import { and, desc, eq, max, sql } from 'drizzle-orm';
import { CvSubmissionConflictError } from '../../../common/errors/index.js';
import { uniqueViolation } from '../../../db/errors.js';
import { cvs } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';

export interface CvRecord {
  id: number;
  studentId: number;
  campaignId: number;
  fileKey: string;
  fileName: string;
  version: number;
  status: CvStatus;
  active: boolean;
  createdAt: Date;
}

export interface CvInsert {
  studentId: number;
  campaignId: number;
  fileKey: string;
  fileName: string;
  version: number;
}

const RECORD_COLUMNS = {
  id: cvs.id,
  studentId: cvs.studentId,
  campaignId: cvs.campaignId,
  fileKey: cvs.fileKey,
  fileName: cvs.fileName,
  version: cvs.version,
  status: cvs.status,
  active: cvs.active,
  createdAt: cvs.createdAt,
};

/** The two unique keys a concurrent upload of the same student and campaign can hit (BR-01). */
const SUBMISSION_KEYS = new Set(['cvs_student_campaign_active_key', 'cvs_student_campaign_version_key']);

/** Drizzle access to `core.cvs`, owned by the student module (AGENTS › Invariant 13). */
@Injectable()
export class CvRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: number): Promise<CvRecord | undefined> {
    const [row] = await this.db.select(RECORD_COLUMNS).from(cvs).where(eq(cvs.id, id));
    return row;
  }

  /** A student's versions, newest first; one campaign or all of them. */
  listByStudent(studentId: number, campaignId?: number): Promise<CvRecord[]> {
    return this.db
      .select(RECORD_COLUMNS)
      .from(cvs)
      .where(and(eq(cvs.studentId, studentId), campaignId === undefined ? undefined : eq(cvs.campaignId, campaignId)))
      .orderBy(desc(cvs.createdAt), desc(cvs.id));
  }

  /**
   * Locks the active version of a student in a campaign. A concurrent upload waits here; once the
   * first commits, the row no longer matches `active` and the second finds none (LESSONS §12: a
   * query without joins, so plain `FOR UPDATE`).
   */
  async lockActive(tx: DbTx, studentId: number, campaignId: number): Promise<{ id: number; version: number } | undefined> {
    const [row] = await tx
      .select({ id: cvs.id, version: cvs.version })
      .from(cvs)
      .where(and(eq(cvs.studentId, studentId), eq(cvs.campaignId, campaignId), eq(cvs.active, true)))
      .for('update');
    return row;
  }

  /** Highest version the student has in the campaign, 0 before the first upload. */
  async latestVersion(tx: DbTx, studentId: number, campaignId: number): Promise<number> {
    const [row] = await tx
      .select({ version: max(cvs.version) })
      .from(cvs)
      .where(and(eq(cvs.studentId, studentId), eq(cvs.campaignId, campaignId)));
    return row?.version ?? 0;
  }

  /** Clears `active` on a superseded version; bumps row_version so stale writers to it fail (AD-8). */
  async deactivate(tx: DbTx, id: number): Promise<void> {
    await tx
      .update(cvs)
      .set({ active: false, rowVersion: sql`${cvs.rowVersion} + 1` })
      .where(eq(cvs.id, id));
  }

  /**
   * Inserts the new active version (PENDING_ANALYSIS by default, AD-8). A concurrent upload that
   * committed first makes the unique index refuse it: 409 (AC-6).
   */
  async insert(tx: DbTx, values: CvInsert): Promise<CvRecord> {
    try {
      const [row] = await tx.insert(cvs).values(values).returning(RECORD_COLUMNS);
      if (!row) throw new Error('insert into cvs returned no row');
      return row;
    } catch (error) {
      const constraint = uniqueViolation(error);
      if (constraint && SUBMISSION_KEYS.has(constraint)) throw new CvSubmissionConflictError(values.campaignId);
      throw error;
    }
  }
}
