import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type CampaignConfig,
  CampaignConfigSchema,
  type CampaignDeadlines,
  type CampaignStatus,
  type CampaignTarget,
  CampaignTargetSchema,
  PhaseDeadlinesSchema,
} from '@srm/shared';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { RowVersionConflictError } from '../../../common/errors/index.js';
import { campaigns } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { AUTO_PHASES } from '../domain/phase.js';

/** What a campaign holds besides its status, as the service reads and writes it. */
export interface CampaignContent {
  name: string;
  target: CampaignTarget;
  phaseDeadlines: CampaignDeadlines;
  config: CampaignConfig;
}

export interface CampaignRecord extends CampaignContent {
  id: number;
  status: CampaignStatus;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

/** The fields the scheduler needs; it never parses target or parameters. */
export interface CampaignPhaseRow {
  id: number;
  status: CampaignStatus;
  phaseDeadlines: CampaignDeadlines;
  rowVersion: number;
}

export interface FindOptions {
  /** Read inside the caller's transaction. */
  tx?: DbTx;
  /** Row lock, only with `tx`: `update` before writing, `share` to keep the phase stable. */
  lock?: 'update' | 'share';
}

/**
 * Drizzle access to `core.campaigns`, owned by the campaign module (AGENTS › Invariant 13). The
 * target lives in `config.target` (CONTEXT D27). `status` is never written here: only
 * `transitionTo` changes it (AD-8).
 */
@Injectable()
export class CampaignRepository {
  private readonly logger = new Logger(CampaignRepository.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async insert(tx: DbTx, content: CampaignContent): Promise<CampaignRecord> {
    const [row] = await tx.insert(campaigns).values(toColumns(content)).returning();
    if (!row) throw new Error('insert into campaigns returned no row');
    return toRecord(row);
  }

  async findById(id: number, options: FindOptions = {}): Promise<CampaignRecord | undefined> {
    const query = (options.tx ?? this.db).select().from(campaigns).where(eq(campaigns.id, id));
    const [row] = options.lock ? await query.for(options.lock) : await query;
    return row && toRecord(row);
  }

  /**
   * Newest first. Drafts are left out unless asked for. A row whose config does not parse is
   * logged and skipped, so one damaged campaign cannot take the whole list down.
   */
  async list(options: { includeDrafts: boolean }): Promise<CampaignRecord[]> {
    const rows = await this.db
      .select()
      .from(campaigns)
      .where(options.includeDrafts ? undefined : ne(campaigns.status, 'DRAFT'))
      .orderBy(desc(campaigns.id));
    return rows.flatMap((row) => this.parseOrSkip(row));
  }

  /** Campaigns in one status, oldest first. A row that does not parse is logged and skipped, as in `list`. */
  async listByStatus(status: CampaignStatus): Promise<CampaignRecord[]> {
    const rows = await this.db.select().from(campaigns).where(eq(campaigns.status, status)).orderBy(campaigns.id);
    return rows.flatMap((row) => this.parseOrSkip(row));
  }

  /** Campaigns in a phase that ends at a deadline. */
  async listInAutoPhases(): Promise<CampaignPhaseRow[]> {
    const rows = await this.db
      .select({
        id: campaigns.id,
        status: campaigns.status,
        phaseDeadlines: campaigns.phaseDeadlines,
        rowVersion: campaigns.rowVersion,
      })
      .from(campaigns)
      .where(inArray(campaigns.status, [...AUTO_PHASES]))
      .orderBy(campaigns.id);
    return rows.map((row) => ({ ...row, phaseDeadlines: PhaseDeadlinesSchema.parse(row.phaseDeadlines) }));
  }

  /** Writes the content with `WHERE row_version = n` and bumps it; a lost race is a 409. */
  async updateVersioned(
    tx: DbTx,
    id: number,
    expectedRowVersion: number,
    content: CampaignContent,
  ): Promise<CampaignRecord> {
    const [row] = await tx
      .update(campaigns)
      .set({ ...toColumns(content), rowVersion: expectedRowVersion + 1 })
      .where(and(eq(campaigns.id, id), eq(campaigns.rowVersion, expectedRowVersion)))
      .returning();
    if (!row) throw new RowVersionConflictError('campaign', id, expectedRowVersion);
    return toRecord(row);
  }

  private parseOrSkip(row: CampaignRow): CampaignRecord[] {
    try {
      return [toRecord(row)];
    } catch (error) {
      this.logger.error(`campaign ${row.id} has invalid stored data: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
}

type CampaignRow = typeof campaigns.$inferSelect;

function toColumns(content: CampaignContent) {
  return {
    name: content.name,
    phaseDeadlines: content.phaseDeadlines,
    config: { ...content.config, target: content.target },
  };
}

/** Rows are written only through validated paths, so a parse failure means corrupted data (500). */
function toRecord(row: CampaignRow): CampaignRecord {
  const { target, ...parameters } = row.config;
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    target: CampaignTargetSchema.parse(target),
    phaseDeadlines: PhaseDeadlinesSchema.parse(row.phaseDeadlines),
    config: CampaignConfigSchema.parse(parameters),
    rowVersion: row.rowVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
