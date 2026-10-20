import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../../src/db/schema/index.js';
import type { Database } from '../../src/db/types.js';

function requiredEnv(name: string): string {
  const url = process.env[name];
  if (!url) throw new Error(`${name} not set — integration global setup did not run`);
  return url;
}

/** URL of the migrated test database started by test/setup/global-setup.ts, as the app's api_service role. */
export function databaseUrl(): string {
  return requiredEnv('DATABASE_URL');
}

/** The same database as its owner (a superuser): for DDL, roles and extensions. */
export function ownerDatabaseUrl(): string {
  return requiredEnv('DATABASE_OWNER_URL');
}

/** The same database as the AI Service's ai_service role. */
export function aiDatabaseUrl(): string {
  return requiredEnv('AI_DATABASE_URL');
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
