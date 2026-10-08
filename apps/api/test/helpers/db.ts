import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../../src/db/schema/index.js';
import type { Database } from '../../src/db/types.js';

/** URL of the migrated test database started by test/setup/global-setup.ts. */
export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set — integration global setup did not run');
  return url;
}

export interface TestDb {
  db: Database;
  pool: Pool;
  close(): Promise<void>;
}

/** A Drizzle handle on its own pool, for seeding and asserting outside the code under test. */
export function createTestDb(url: string = databaseUrl()): TestDb {
  const pool = new Pool({ connectionString: url, max: 4 });
  return { db: drizzle({ client: pool, schema }), pool, close: () => pool.end() };
}
