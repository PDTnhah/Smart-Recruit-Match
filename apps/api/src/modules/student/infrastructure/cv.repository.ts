import { Inject, Injectable } from '@nestjs/common';
import { type CenterCvListQuery, type CvPii, CvPiiSchema, type CvProfile, type CvSource, type CvStatus } from '@srm/shared';
import { and, desc, eq, inArray, max, or, type SQL, sql } from 'drizzle-orm';
import { CvSubmissionConflictError, EntityNotFoundError, RowVersionConflictError } from '../../../common/errors/index.js';
import { uniqueViolation } from '../../../db/errors.js';
import { cvs, students } from '../../../db/schema/index.js';
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

/** A CV row as the analysis listener sees it, locked (US-2.4). */
export interface CvAnalysisRow {
  id: number;
  studentId: number;
  campaignId: number;
  fileKey: string;
  version: number;
  status: CvStatus;
  active: boolean;
  rowVersion: number;
}

/** A CV version with its profile, as the student reviews it (US-2.6). */
export interface CvProfileRecord {
  id: number;
  studentId: number;
  campaignId: number;
  version: number;
  status: CvStatus;
  active: boolean;
  rowVersion: number;
  fileName: string;
  /** Null until the analysis succeeds (CHECK cvs_analysed_check). */
  profile: CvProfile | null;
}

const PROFILE_COLUMNS = {
  id: cvs.id,
  studentId: cvs.studentId,
  campaignId: cvs.campaignId,
  version: cvs.version,
  status: cvs.status,
  active: cvs.active,
  rowVersion: cvs.rowVersion,
  fileName: cvs.fileName,
  profile: cvs.profile,
};

/** What a successful analysis stores (US-2.4 AC-9). `pii` is encrypted by the database. */
export interface CvAnalysisResult {
  profile: CvProfile;
  profileMasked: CvProfile;
  pii: CvPii;
  maskedText: string | null;
  source: CvSource;
  model: string;
  promptVersion: string;
  hiddenTextDetected: boolean;
}

/** A row of the center's list: the CV with its student (US-2.4 AC-11). */
export interface CenterCvRecord extends CvRecord {
  studentCode: string;
  studentName: string;
  hiddenTextFlag: boolean;
  analysisErrorCode: string | null;
}

/** Columns the analysis writes; `pii` is an SQL expression so the database encrypts it. */
type CvAnalysisChanges = Partial<
  Pick<
    typeof cvs.$inferInsert,
    | 'profile'
    | 'profileMasked'
    | 'maskedText'
    | 'analysisSource'
    | 'analysisModel'
    | 'analysisPromptVersion'
    | 'analysisErrorCode'
    | 'hiddenTextFlag'
  >
> & { pii?: SQL };

const ANALYSIS_COLUMNS = {
  id: cvs.id,
  studentId: cvs.studentId,
  campaignId: cvs.campaignId,
  fileKey: cvs.fileKey,
  version: cvs.version,
  status: cvs.status,
  active: cvs.active,
  rowVersion: cvs.rowVersion,
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

  /**
   * The CV versions center staff see (US-2.4 AC-11): the active one of each student, newest
   * first. `attention` keeps those whose analysis failed or whose file hid text.
   */
  listForCenter(query: CenterCvListQuery): Promise<CenterCvRecord[]> {
    const filters: (SQL | undefined)[] = [eq(cvs.active, true)];
    if (query.campaignId !== undefined) filters.push(eq(cvs.campaignId, query.campaignId));
    if (query.attention === 'true') filters.push(or(eq(cvs.status, 'ANALYSIS_FAILED'), eq(cvs.hiddenTextFlag, true)));
    return this.db
      .select({
        ...RECORD_COLUMNS,
        studentCode: students.studentCode,
        studentName: students.fullName,
        hiddenTextFlag: cvs.hiddenTextFlag,
        analysisErrorCode: cvs.analysisErrorCode,
      })
      .from(cvs)
      .innerJoin(students, eq(students.id, cvs.studentId))
      .where(and(...filters))
      .orderBy(desc(cvs.createdAt), desc(cvs.id))
      .limit(query.limit)
      .offset(query.offset);
  }

  /** Active CVs in one of `statuses`, oldest first, for the re-dispatch command (US-2.4). */
  listActiveIn(statuses: readonly CvStatus[], campaignId?: number): Promise<CvAnalysisRow[]> {
    return this.db
      .select(ANALYSIS_COLUMNS)
      .from(cvs)
      .where(
        and(
          eq(cvs.active, true),
          inArray(cvs.status, [...statuses]),
          campaignId === undefined ? undefined : eq(cvs.campaignId, campaignId),
        ),
      )
      .orderBy(cvs.id);
  }

  /** Locks one CV row for the analysis listener (LESSONS §12: no join, so plain `FOR UPDATE`). */
  async lockForAnalysis(tx: DbTx, id: number): Promise<CvAnalysisRow | undefined> {
    const [row] = await tx.select(ANALYSIS_COLUMNS).from(cvs).where(eq(cvs.id, id)).for('update');
    return row;
  }

  /**
   * Stores a successful analysis with `WHERE row_version = n` and bumps it (AD-8). `pii` goes in as
   * JSON encrypted by pgcrypto under `key` (NFR-3); the key travels as a bound parameter, never in
   * the SQL text. A hidden-text flag already set stays set.
   */
  async storeAnalysis(tx: DbTx, id: number, expectedRowVersion: number, result: CvAnalysisResult, key: string): Promise<void> {
    await this.updateVersioned(tx, id, expectedRowVersion, {
      profile: result.profile,
      profileMasked: result.profileMasked,
      pii: sql`pgp_sym_encrypt(${JSON.stringify(result.pii)}::text, ${key}::text)`,
      maskedText: result.maskedText,
      analysisSource: result.source,
      analysisModel: result.model,
      analysisPromptVersion: result.promptVersion,
      ...(result.hiddenTextDetected ? { hiddenTextFlag: true } : {}),
    });
  }

  /** Records why the analysis failed; the hidden-text flag is kept for the center (AC-11). */
  async storeFailure(
    tx: DbTx,
    id: number,
    expectedRowVersion: number,
    failure: { errorCode: string; hiddenTextDetected: boolean },
  ): Promise<void> {
    await this.updateVersioned(tx, id, expectedRowVersion, {
      analysisErrorCode: failure.errorCode,
      ...(failure.hiddenTextDetected ? { hiddenTextFlag: true } : {}),
    });
  }

  /** The active version of a student in a campaign, with its profile (US-2.6). */
  async findActiveProfile(studentId: number, campaignId: number): Promise<CvProfileRecord | undefined> {
    const [row] = await this.db
      .select(PROFILE_COLUMNS)
      .from(cvs)
      .where(and(eq(cvs.studentId, studentId), eq(cvs.campaignId, campaignId), eq(cvs.active, true)));
    return row;
  }

  /** Locks one CV row for the student's review (LESSONS §12: no join, so plain `FOR UPDATE`). */
  async lockForProfile(tx: DbTx, id: number): Promise<CvProfileRecord | undefined> {
    const [row] = await tx.select(PROFILE_COLUMNS).from(cvs).where(eq(cvs.id, id)).for('update');
    return row;
  }

  /**
   * The personal data of a CV, decrypted under `key` to mask the edited profile again (US-2.6
   * AC-5). The key travels as a bound parameter; the values never leave this process.
   */
  async readPii(tx: DbTx, id: number, key: string): Promise<CvPii | null> {
    const [row] = await tx
      .select({ pii: sql<string | null>`pgp_sym_decrypt(${cvs.pii}, ${key}::text)` })
      .from(cvs)
      .where(eq(cvs.id, id));
    return row?.pii ? CvPiiSchema.parse(JSON.parse(row.pii)) : null;
  }

  /** The profile the student saved and its masked copy, with `WHERE row_version = n` (AD-8). */
  async storeProfile(
    tx: DbTx,
    id: number,
    expectedRowVersion: number,
    profile: CvProfile,
    profileMasked: CvProfile,
  ): Promise<void> {
    await this.updateVersioned(tx, id, expectedRowVersion, { profile, profileMasked });
  }

  private async updateVersioned(
    tx: DbTx,
    id: number,
    expectedRowVersion: number,
    changes: CvAnalysisChanges,
  ): Promise<void> {
    const updated = await tx
      .update(cvs)
      .set({ ...changes, rowVersion: expectedRowVersion + 1 })
      .where(and(eq(cvs.id, id), eq(cvs.rowVersion, expectedRowVersion)))
      .returning({ id: cvs.id });
    if (updated.length === 0) throw new RowVersionConflictError('cv', id, expectedRowVersion);
  }

  /** A student's versions, newest first; one campaign or all of them. */
  listByStudent(studentId: number, campaignId?: number): Promise<CvRecord[]> {
    return this.db
      .select(RECORD_COLUMNS)
      .from(cvs)
      .where(and(eq(cvs.studentId, studentId), campaignId === undefined ? undefined : eq(cvs.campaignId, campaignId)))
      .orderBy(desc(cvs.createdAt), desc(cvs.id));
  }

  /** Students with an active CV in the campaign (BR-01: at most one row each). */
  async studentIdsWithActive(campaignId: number): Promise<number[]> {
    const rows = await this.db
      .select({ studentId: cvs.studentId })
      .from(cvs)
      .where(and(eq(cvs.campaignId, campaignId), eq(cvs.active, true)));
    return rows.map((row) => row.studentId);
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
  insert(tx: DbTx, values: CvInsert): Promise<CvRecord & { rowVersion: number }> {
    return this.insertVersion(tx, values);
  }

  /**
   * "Sửa lại" (US-2.6 AC-12, CONTEXT D40): version `version` copies the file, the profile, the
   * encrypted personal data (as stored, never decrypted) and the analysis of `fromId`, so it needs
   * no new analysis. Inserted PENDING_ANALYSIS like every version; the caller moves it on with
   * transitionTo. Both versions then share one file object.
   */
  async insertReopened(tx: DbTx, fromId: number, version: number): Promise<CvRecord & { rowVersion: number }> {
    const [source] = await tx
      .select({
        studentId: cvs.studentId,
        campaignId: cvs.campaignId,
        fileKey: cvs.fileKey,
        fileName: cvs.fileName,
        profile: cvs.profile,
        profileMasked: cvs.profileMasked,
        pii: cvs.pii,
        maskedText: cvs.maskedText,
        analysisSource: cvs.analysisSource,
        analysisModel: cvs.analysisModel,
        analysisPromptVersion: cvs.analysisPromptVersion,
        hiddenTextFlag: cvs.hiddenTextFlag,
      })
      .from(cvs)
      .where(eq(cvs.id, fromId));
    if (!source) throw new EntityNotFoundError('cv', fromId);
    return this.insertVersion(tx, { ...source, version });
  }

  private async insertVersion(
    tx: DbTx,
    values: typeof cvs.$inferInsert & CvInsert,
  ): Promise<CvRecord & { rowVersion: number }> {
    try {
      const [row] = await tx
        .insert(cvs)
        .values(values)
        .returning({ ...RECORD_COLUMNS, rowVersion: cvs.rowVersion });
      if (!row) throw new Error('insert into cvs returned no row');
      return row;
    } catch (error) {
      const constraint = uniqueViolation(error);
      if (constraint && SUBMISSION_KEYS.has(constraint)) throw new CvSubmissionConflictError(values.campaignId);
      throw error;
    }
  }
}
