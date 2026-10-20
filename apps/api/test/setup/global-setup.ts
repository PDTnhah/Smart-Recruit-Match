import { randomBytes } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
// globalSetup is loaded with plain require (no moduleNameMapper), so no `.js` suffix here.
import { configureServiceRoles, runMigrations } from '../../src/db/migrate';
import { MINIO_IMAGE, POSTGRES_IMAGE, REDIS_IMAGE } from './images';

declare global {
  var __SRM_POSTGRES__: StartedPostgreSqlContainer | undefined;
  var __SRM_REDIS__: StartedTestContainer | undefined;
  var __SRM_MINIO__: StartedTestContainer | undefined;
}

const REDIS_PORT = 6379;
const MINIO_PORT = 9000;
const MINIO_ACCESS_KEY = 'srm-test';
const MINIO_SECRET_KEY = 'srm-test-secret';
const API_DB_PASSWORD = 'api-service-test';
const AI_DB_PASSWORD = 'ai-service-test';

/** The test database URL with another role's credentials. */
function asRole(url: string, role: string, password: string): string {
  const target = new URL(url);
  target.username = role;
  target.password = password;
  return target.toString();
}

// Starts one throwaway PostgreSQL (+ pgvector), one Redis and one MinIO for the integration
// project and applies the migrations in apps/api/drizzle. Test workers are spawned after this
// runs, so they inherit the environment set here. Independent of the compose stack.
export default async function globalSetup(): Promise<void> {
  const results = await Promise.allSettled([
    new PostgreSqlContainer(POSTGRES_IMAGE)
      .withDatabase('srm_test')
      .withUsername('srm')
      .withPassword('srm')
      .start(),
    new GenericContainer(REDIS_IMAGE)
      .withExposedPorts(REDIS_PORT)
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
      .start(),
    new GenericContainer(MINIO_IMAGE)
      .withExposedPorts(MINIO_PORT)
      .withEnvironment({
        MINIO_ROOT_USER: MINIO_ACCESS_KEY,
        MINIO_ROOT_PASSWORD: MINIO_SECRET_KEY,
        // SSE-S3 needs a KMS key (CONTEXT D28); a fresh one per run is enough for tests.
        MINIO_KMS_SECRET_KEY: `srm-test-key:${randomBytes(32).toString('base64')}`,
      })
      // The image runs as a non-root user that cannot create /data; /tmp is writable.
      .withCommand(['server', '/tmp/data'])
      .withWaitStrategy(Wait.forHttp('/minio/health/ready', MINIO_PORT))
      .start(),
  ]);
  // Jest skips globalTeardown when globalSetup throws; do not leave containers running.
  const stopAll = () =>
    Promise.allSettled(results.flatMap((result) => (result.status === 'fulfilled' ? [result.value.stop()] : [])));
  const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failed) {
    await stopAll();
    throw failed.reason;
  }
  const [postgres, redis, minio] = results.map((result) => (result as PromiseFulfilledResult<unknown>).value) as [
    StartedPostgreSqlContainer,
    StartedTestContainer,
    StartedTestContainer,
  ];
  globalThis.__SRM_POSTGRES__ = postgres;
  globalThis.__SRM_REDIS__ = redis;
  globalThis.__SRM_MINIO__ = minio;

  // The app under test connects as api_service, like the compose stack (CONTEXT D33). Tests that
  // need the owner (create a database, roles, extensions) use DATABASE_OWNER_URL.
  const ownerUrl = postgres.getConnectionUri();
  process.env.DATABASE_OWNER_URL = ownerUrl;
  process.env.DATABASE_URL = asRole(ownerUrl, 'api_service', API_DB_PASSWORD);
  process.env.AI_DATABASE_URL = asRole(ownerUrl, 'ai_service', AI_DB_PASSWORD);
  process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(REDIS_PORT)}`;
  process.env.JWT_ACCESS_SECRET = 'integration-test-access-secret-0123456789';
  process.env.MINIO_ENDPOINT = `http://${minio.getHost()}:${minio.getMappedPort(MINIO_PORT)}`;
  process.env.MINIO_ACCESS_KEY = MINIO_ACCESS_KEY;
  process.env.MINIO_SECRET_KEY = MINIO_SECRET_KEY;
  process.env.WEB_ORIGIN = 'http://srm.test';
  process.env.LOG_LEVEL = 'silent';
  // The cron must not move campaigns created by other test files; scheduler tests call runOnce().
  process.env.SCHEDULER_ENABLED = 'false';
  try {
    await runMigrations(ownerUrl);
    await configureServiceRoles(ownerUrl, { api_service: API_DB_PASSWORD, ai_service: AI_DB_PASSWORD });
  } catch (error) {
    await stopAll();
    throw error;
  }
}
