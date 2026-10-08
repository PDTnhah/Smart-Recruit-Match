import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
// globalSetup is loaded with plain require (no moduleNameMapper), so no `.js` suffix here.
import { POSTGRES_IMAGE } from './images';

declare global {
  var __SRM_POSTGRES__: StartedPostgreSqlContainer | undefined;
}

// Starts one throwaway PostgreSQL (+ pgvector) for the integration project. Test workers are
// spawned after this runs, so they inherit DATABASE_URL. Independent of the compose stack.
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase('srm_test')
    .withUsername('srm')
    .withPassword('srm')
    .start();
  globalThis.__SRM_POSTGRES__ = container;
  process.env.DATABASE_URL = container.getConnectionUri();
}
