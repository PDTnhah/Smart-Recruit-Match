import { Inject, Injectable } from '@nestjs/common';
import type { PreferenceItem } from '@srm/shared';
import { and, asc, eq } from 'drizzle-orm';
import { ADVISORY_LOCK_KEYS, lockEntityInTx } from '../../../common/scheduling/advisory-lock.js';
import { preferences } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import type { PreferenceEntry } from '../domain/preference-list.js';

const ITEM_COLUMNS = { jdId: preferences.jdId, rank: preferences.rank, status: preferences.status };

/** Drizzle access to `core.preferences`, owned by the matching module (AGENTS › Invariant 13). */
@Injectable()
export class PreferencesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Serializes every change to one student's list until the transaction ends (AC-13, CONTEXT D47). */
  async lockStudent(tx: DbTx, studentId: number): Promise<void> {
    await lockEntityInTx(tx, ADVISORY_LOCK_KEYS.STUDENT_PREFERENCES, studentId);
  }

  /** The student's list in the campaign, NV1 first. */
  async listOf(campaignId: number, studentId: number, tx: DbTx | Database = this.db): Promise<PreferenceItem[]> {
    return tx
      .select(ITEM_COLUMNS)
      .from(preferences)
      .where(and(eq(preferences.campaignId, campaignId), eq(preferences.studentId, studentId)))
      .orderBy(asc(preferences.rank));
  }

  /**
   * Replaces the whole list: delete, then insert in PENDING_TEST (the initial state of the
   * application lifecycle, AD-8). Nothing points at a preference before the tests, so deleting is
   * safe, and no rank is ever held twice in between (CONTEXT D47). Call under `lockStudent`.
   */
  async replace(tx: DbTx, campaignId: number, studentId: number, items: readonly PreferenceEntry[]): Promise<PreferenceItem[]> {
    await tx.delete(preferences).where(and(eq(preferences.campaignId, campaignId), eq(preferences.studentId, studentId)));
    if (items.length === 0) return [];
    const rows = await tx
      .insert(preferences)
      .values(items.map((item) => ({ campaignId, studentId, jdId: item.jdId, rank: item.rank })))
      .returning(ITEM_COLUMNS);
    return rows.sort((a, b) => a.rank - b.rank);
  }

  /** Students of the campaign with at least one preference. */
  async studentIdsWithAny(campaignId: number): Promise<Set<number>> {
    const rows = await this.db
      .selectDistinct({ studentId: preferences.studentId })
      .from(preferences)
      .where(eq(preferences.campaignId, campaignId));
    return new Set(rows.map((row) => row.studentId));
  }
}
