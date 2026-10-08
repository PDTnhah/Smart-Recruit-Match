import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
// globalSetup is loaded with plain require (no moduleNameMapper), so no `.js` suffix here.
import { runMigrations } from '../../src/db/migrate';
import { POSTGRES_IMAGE, REDIS_IMAGE } from './images';

declare global {
  var __SRM_POSTGRES__: StartedPostgreSqlContainer | undefined;
  var __SRM_REDIS__: StartedTestContainer | undefined;
}

const REDIS_PORT = 6379;

// Starts one throwaway PostgreSQL (+ pgvector) and one Redis for the integration project and
// applies the migrations in apps/api/drizzle. Test workers are spawned after this runs, so they
// inherit the environment set here. Independent of the compose stack.
export default async function globalSetup(): Promise<void> {
  const [postgres, redis] = await Promise.allSettled([
    new PostgreSqlContainer(POSTGRES_IMAGE)
      .withDatabase('srm_test')
      .withUsername('srm')
      .withPassword('srm')
      .start(),
    new GenericContainer(REDIS_IMAGE)
      .withExposedPorts(REDIS_PORT)
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
      .start(),
  ]);
  // Jest skips globalTeardown when globalSetup throws; do not leave containers running.
  const stopAll = () =>
    Promise.allSettled(
      [postgres, redis].flatMap((result) => (result.status === 'fulfilled' ? [result.value.stop()] : [])),
    );
  if (postgres.status === 'rejected' || redis.status === 'rejected') {
    await stopAll();
    throw postgres.status === 'rejected' ? postgres.reason : (redis as PromiseRejectedResult).reason;
  }
  globalThis.__SRM_POSTGRES__ = postgres.value;
  globalThis.__SRM_REDIS__ = redis.value;

  process.env.DATABASE_URL = postgres.value.getConnectionUri();
  process.env.REDIS_URL = `redis://${redis.value.getHost()}:${redis.value.getMappedPort(REDIS_PORT)}`;
  process.env.JWT_ACCESS_SECRET = 'integration-test-access-secret-0123456789';
  process.env.LOG_LEVEL = 'silent';
  try {
    await runMigrations(process.env.DATABASE_URL);
  } catch (error) {
    await stopAll();
    throw error;
  }
}
