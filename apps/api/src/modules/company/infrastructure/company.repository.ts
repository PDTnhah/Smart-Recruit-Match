import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { companies, type CompanyContact } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';

/** What a company holds, as the service reads and writes it. Empty texts are stored as null. */
export interface CompanyContent {
  name: string;
  field: string | null;
  address: string | null;
  contact: CompanyContact;
}

export interface CompanyRecord extends CompanyContent {
  id: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Drizzle access to `core.companies`, owned by the company module (AGENTS › Invariant 13). */
@Injectable()
export class CompanyRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async insert(tx: DbTx, content: CompanyContent): Promise<CompanyRecord> {
    const [row] = await tx.insert(companies).values(content).returning();
    if (!row) throw new Error('insert into companies returned no row');
    return toRecord(row);
  }

  async findById(id: number, options: { tx?: DbTx; lock?: 'update' } = {}): Promise<CompanyRecord | undefined> {
    const query = (options.tx ?? this.db).select().from(companies).where(eq(companies.id, id));
    const [row] = options.lock ? await query.for(options.lock) : await query;
    return row && toRecord(row);
  }

  /** Alphabetical, the order the center looks companies up in. */
  async list(): Promise<CompanyRecord[]> {
    const rows = await this.db.select().from(companies).orderBy(asc(companies.name), asc(companies.id));
    return rows.map(toRecord);
  }

  async update(tx: DbTx, id: number, content: CompanyContent): Promise<CompanyRecord> {
    const [row] = await tx.update(companies).set(content).where(eq(companies.id, id)).returning();
    if (!row) throw new Error(`update of companies ${id} returned no row`);
    return toRecord(row);
  }
}

function toRecord(row: typeof companies.$inferSelect): CompanyRecord {
  return {
    id: row.id,
    name: row.name,
    field: row.field,
    address: row.address,
    contact: row.contact ?? {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
