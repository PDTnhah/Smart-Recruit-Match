// Applies pending SQL migrations from apps/api/drizzle (AD-9). Entry point of the compose
// `migrate` service (`node dist/db/migrate.js`) and used by the integration-test global setup.
// Keep this file free of relative imports: Jest loads globalSetup without moduleNameMapper.
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';

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

/** Roles created without LOGIN by migration 0006, and the variable holding each one's password. */
export const SERVICE_ROLE_PASSWORD_ENV = {
  api_service: 'API_DB_PASSWORD',
  ai_service: 'AI_DB_PASSWORD',
} as const;

export type ServiceRole = keyof typeof SERVICE_ROLE_PASSWORD_ENV;

/** The password goes into connection URLs (DATABASE_URL, AI_DATABASE_URL), so no escaping is needed there. */
const URL_SAFE_PASSWORD = /^[A-Za-z0-9._~-]{12,}$/;

/** Rejects a password that would need escaping in a URL, before anything touches the database. */
export function servicePasswords(
  passwords: Partial<Record<ServiceRole, string | undefined>>,
): [ServiceRole, string][] {
  const entries = Object.entries(passwords).filter((entry): entry is [ServiceRole, string] => Boolean(entry[1]));
  for (const [role, password] of entries) {
    if (!URL_SAFE_PASSWORD.test(password)) {
      throw new Error(`${SERVICE_ROLE_PASSWORD_ENV[role]} must be at least 12 characters of A-Z a-z 0-9 . _ ~ -`);
    }
  }
  return entries;
}

/**
 * Lets each service role log in with the given password (CONTEXT D33). A role without a password
 * (unset or empty, LESSONS §14) keeps its current state. Runs as the migration owner, after
 * `runMigrations` created the roles.
 */
export async function configureServiceRoles(
  connectionString: string,
  passwords: Partial<Record<ServiceRole, string | undefined>>,
): Promise<ServiceRole[]> {
  const entries = servicePasswords(passwords);
  if (entries.length === 0) return [];
  const client = new Client({ connectionString });
  await client.connect();
  try {
    for (const [role, password] of entries) {
      // Role names are the fixed keys above; only the password is data.
      await client.query(`ALTER ROLE ${role} LOGIN PASSWORD ${client.escapeLiteral(password)}`);
    }
  } finally {
    await client.end();
  }
  return entries.map(([role]) => role);
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('migrate: DATABASE_URL is not set');
    process.exit(1);
  }
  const passwords = {
    api_service: process.env[SERVICE_ROLE_PASSWORD_ENV.api_service],
    ai_service: process.env[SERVICE_ROLE_PASSWORD_ENV.ai_service],
  };
  const run = async () => {
    servicePasswords(passwords);
    await runMigrations(url);
    return configureServiceRoles(url, passwords);
  };
  run().then(
    (roles) => {
      console.log(`migrate: applied migrations from ${MIGRATIONS_FOLDER}`);
      console.log(`migrate: login enabled for ${roles.length > 0 ? roles.join(', ') : 'no service role'}`);
    },
    (error: unknown) => {
      console.error('migrate: failed', error);
      process.exit(1);
    },
  );
}
