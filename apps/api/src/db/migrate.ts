// Applies pending SQL migrations from apps/api/drizzle (AD-9). Entry point of the compose
// `migrate` service (`node dist/db/migrate.js`) and used by the integration-test global setup.
// Keep this file free of relative imports: Jest loads globalSetup without moduleNameMapper.
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

/** `apps/api/drizzle`, the same relative path from src/db (ts-jest) and dist/db (built image). */
export const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../drizzle');

/**
 * Runs every migration newer than the last one recorded in `drizzle.__drizzle_migrations`, all in
 * one transaction. Running it again on an up-to-date database changes nothing.
 */
export async function runMigrations(
  connectionString: string,
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<void> {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('migrate: DATABASE_URL is not set');
    process.exit(1);
  }
  runMigrations(url).then(
    () => console.log(`migrate: applied migrations from ${MIGRATIONS_FOLDER}`),
    (error: unknown) => {
      console.error('migrate: failed', error);
      process.exit(1);
    },
  );
}
