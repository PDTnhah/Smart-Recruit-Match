import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import type * as schema from './schema/index.js';

export type Schema = typeof schema;

/** Drizzle over the shared pool; `$client` is the pool itself. */
export type Database = NodePgDatabase<Schema> & { $client: Pool };

/** The transaction handle Drizzle passes to `db.transaction(fn)`. */
export type DbTx = Parameters<Parameters<Database['transaction']>[0]>[0];
