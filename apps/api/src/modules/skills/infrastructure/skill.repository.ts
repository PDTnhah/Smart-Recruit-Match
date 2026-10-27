import { Inject, Injectable } from '@nestjs/common';
import {
  type CatalogSkill,
  type SkillGroup,
  skillMachine,
  skillMatchKey,
  type SkillStatus,
  type SkillSuggestion,
} from '@srm/shared';
import { and, arrayOverlaps, asc, desc, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { RowVersionConflictError } from '../../../common/errors/index.js';
import { ADVISORY_LOCK_KEYS } from '../../../common/scheduling/advisory-lock.js';
import { skills } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import type { KeyedName, KeyedSkill } from '../domain/catalogue-keys.js';

/**
 * Most rows one admin listing returns. Pending names come oldest first, as a queue; reviewed ones
 * latest decision first, so a skill just approved or merged is always on the page.
 */
export const ADMIN_LIST_LIMIT = 500;

export interface SkillRecord extends KeyedSkill {
  group: SkillGroup | null;
  mergedInto: { id: number; canonicalName: string } | null;
  suggestion: SkillSuggestion | null;
  suggestionModel: string | null;
  suggestionPromptVersion: string | null;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface LockedSkill extends KeyedSkill {
  rowVersion: number;
}

/** Columns ADMIN review writes besides `status`, which only transitionTo writes (AD-8). */
export interface SkillChanges {
  canonicalName?: string;
  nameKey?: string;
  aliases?: string[];
  group?: SkillGroup;
  mergedIntoId?: number;
}

const mergedInto = alias(skills, 'merged_into');

const RECORD_COLUMNS = {
  id: skills.id,
  canonicalName: skills.canonicalName,
  nameKey: skills.nameKey,
  aliases: skills.aliases,
  group: skills.group,
  status: skills.status,
  mergedIntoId: skills.mergedIntoId,
  mergedIntoName: mergedInto.canonicalName,
  suggestion: skills.suggestion,
  suggestionModel: skills.suggestionModel,
  suggestionPromptVersion: skills.suggestionPromptVersion,
  rowVersion: skills.rowVersion,
  createdAt: skills.createdAt,
  updatedAt: skills.updatedAt,
};

const KEYED_COLUMNS = {
  id: skills.id,
  canonicalName: skills.canonicalName,
  nameKey: skills.nameKey,
  aliases: skills.aliases,
  status: skills.status,
  rowVersion: skills.rowVersion,
};

/** core.skills, owned by the skills module (FR-13, CONTEXT D39). */
@Injectable()
export class SkillRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: number, options: { tx?: DbTx } = {}): Promise<SkillRecord | undefined> {
    const [row] = await this.selectRecords(options.tx ?? this.db).where(eq(skills.id, id));
    return row && toRecord(row);
  }

  async list(status: SkillStatus): Promise<SkillRecord[]> {
    const rows = await this.selectRecords(this.db)
      .where(eq(skills.status, status))
      .orderBy(
        ...(status === 'PENDING'
          ? [asc(skills.createdAt), asc(skills.id)]
          : [desc(skills.updatedAt), desc(skills.id)]),
      )
      .limit(ADMIN_LIST_LIMIT);
    return rows.map(toRecord);
  }

  /**
   * Approved skills whose name or alias key contains the key of `query`, so "react js" finds React
   * by its alias ReactJS. A name or alias with exactly that key first, then key prefix, then by name.
   */
  async search(query: string | undefined, limit: number): Promise<CatalogSkill[]> {
    const key = skillMatchKey(query?.trim() ?? '');
    const conditions: SQL[] = [eq(skills.status, 'APPROVED')];
    let rank = sql`0`;
    if (key !== '') {
      const contains = `%${escapeLike(key)}%`;
      const prefix = `${escapeLike(key)}%`;
      conditions.push(
        or(
          sql`${skills.nameKey} like ${contains}`,
          sql`exists (select 1 from unnest(${skills.aliasKeys}) as alias_key where alias_key like ${contains})`,
        )!,
      );
      rank = sql`case when ${skills.nameKey} = ${key} or ${skills.aliasKeys} @> array[${key}]::text[] then 0
        when ${skills.nameKey} like ${prefix} then 1 else 2 end`;
    }
    const rows = await this.db
      .select({ id: skills.id, canonicalName: skills.canonicalName, group: skills.group, aliases: skills.aliases })
      .from(skills)
      .where(and(...conditions))
      .orderBy(rank, asc(skills.canonicalName))
      .limit(limit);
    // CHECK skills_approved_group_check: an approved skill always has a group.
    return rows.map((row) => ({ ...row, group: row.group! }));
  }

  /** Approved skills whose name or one of whose aliases has one of `keys`. */
  async approvedByKeys(keys: readonly string[]): Promise<Array<{ canonicalName: string; nameKey: string; aliasKeys: string[] }>> {
    if (keys.length === 0) return [];
    return this.db
      .select({ canonicalName: skills.canonicalName, nameKey: skills.nameKey, aliasKeys: skills.aliasKeys })
      .from(skills)
      .where(
        and(eq(skills.status, 'APPROVED'), or(inArray(skills.nameKey, [...keys]), arrayOverlaps(skills.aliasKeys, [...keys]))),
      );
  }

  /** Locks the rows in id order, so two transactions locking the same pair cannot deadlock. */
  async lock(tx: DbTx, ids: readonly number[]): Promise<LockedSkill[]> {
    return tx
      .select(KEYED_COLUMNS)
      .from(skills)
      .where(inArray(skills.id, [...ids]))
      .orderBy(asc(skills.id))
      .for('update');
  }

  /**
   * ADVISORY_LOCK_KEYS.SKILL_CATALOGUE until commit. ADMIN changes to names and aliases take it
   * `exclusive`, so their key check and write run as one step; new pending names take it `shared`,
   * so none lands between that check and that write.
   */
  async lockCatalogue(tx: DbTx, mode: 'exclusive' | 'shared'): Promise<void> {
    const key = ADVISORY_LOCK_KEYS.SKILL_CATALOGUE;
    await tx.execute(
      mode === 'exclusive' ? sql`select pg_advisory_xact_lock(${key})` : sql`select pg_advisory_xact_lock_shared(${key})`,
    );
  }

  /** The skills a key check needs: every approved skill (its aliases) and any skill named by `keys`. */
  async keyedSkills(tx: DbTx, keys: readonly string[]): Promise<KeyedSkill[]> {
    return tx
      .select(KEYED_COLUMNS)
      .from(skills)
      .where(or(eq(skills.status, 'APPROVED'), inArray(skills.nameKey, [...keys])));
  }

  /**
   * AC-5: one PENDING row per name not seen before. A key already present, in any status, is
   * skipped, so a reviewed name is not queued again. Returns the new rows.
   */
  async insertPending(tx: DbTx, names: readonly KeyedName[]): Promise<Array<{ id: number; canonicalName: string }>> {
    if (names.length === 0) return [];
    return tx
      .insert(skills)
      .values(names.map(({ name, key }) => ({ canonicalName: name, nameKey: key })))
      .onConflictDoNothing()
      .returning({ id: skills.id, canonicalName: skills.canonicalName });
  }

  /**
   * AC-6: keeps the first suggestion of a skill still awaiting review; false when there is none to
   * keep (reviewed meanwhile, or a duplicate result). row_version stays: the suggestion is advice
   * ADMIN never edits, and must not turn a review already open into a conflict.
   */
  async storeSuggestion(
    tx: DbTx,
    id: number,
    suggestion: SkillSuggestion,
    model: string,
    promptVersion: string,
  ): Promise<boolean> {
    const updated = await tx
      .update(skills)
      .set({ suggestion, suggestionModel: model, suggestionPromptVersion: promptVersion })
      .where(and(eq(skills.id, id), eq(skills.status, 'PENDING'), isNull(skills.suggestion)))
      .returning({ id: skills.id });
    return updated.length > 0;
  }

  /** `aliases` also writes their keys, which the trigger skills_keys_distinct checks. */
  async updateVersioned(tx: DbTx, id: number, expectedRowVersion: number, changes: SkillChanges): Promise<void> {
    const aliasKeys = changes.aliases?.map(skillMatchKey);
    const updated = await tx
      .update(skills)
      .set({ ...changes, ...(aliasKeys && { aliasKeys }), rowVersion: expectedRowVersion + 1 })
      .where(and(eq(skills.id, id), eq(skills.rowVersion, expectedRowVersion)))
      .returning({ id: skills.id });
    if (updated.length === 0) throw new RowVersionConflictError(skillMachine.name, id, expectedRowVersion);
  }

  private selectRecords(db: Database | DbTx) {
    return db.select(RECORD_COLUMNS).from(skills).leftJoin(mergedInto, eq(mergedInto.id, skills.mergedIntoId));
  }
}

interface RecordRow extends Omit<SkillRecord, 'mergedInto'> {
  mergedIntoId: number | null;
  mergedIntoName: string | null;
}

function toRecord({ mergedIntoId, mergedIntoName, ...row }: RecordRow): SkillRecord {
  return {
    ...row,
    mergedInto: mergedIntoId !== null && mergedIntoName !== null ? { id: mergedIntoId, canonicalName: mergedIntoName } : null,
  };
}

/** `query` as a literal LIKE pattern: `%`, `_` and the escape character match themselves. */
function escapeLike(query: string): string {
  return query.replace(/[\\%_]/g, (char) => `\\${char}`);
}
