import { randomBytes } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Network, type StartedNetwork, type StartedTestContainer, Wait } from 'testcontainers';
// globalSetup is loaded with plain require (no moduleNameMapper), so no `.js` suffix here.
import { configureServiceRoles, runMigrations } from '../../src/db/migrate';
import { MINIO_IMAGE, POSTGRES_IMAGE, RABBITMQ_IMAGE, REDIS_IMAGE } from './images';

declare global {
  var __SRM_NETWORK__: StartedNetwork | undefined;
  var __SRM_POSTGRES__: StartedPostgreSqlContainer | undefined;
  var __SRM_REDIS__: StartedTestContainer | undefined;
  var __SRM_MINIO__: StartedTestContainer | undefined;
  var __SRM_RABBITMQ__: StartedTestContainer | undefined;
}

const REDIS_PORT = 6379;
const MINIO_PORT = 9000;
const MINIO_ACCESS_KEY = 'srm-test';
const MINIO_SECRET_KEY = 'srm-test-secret';
const API_DB_PASSWORD = 'api-service-test';
const AI_DB_PASSWORD = 'ai-service-test';
const AMQP_PORT = 5672;
const RABBITMQ_UI_PORT = 15672;
const RABBITMQ_USER = 'srm';
const RABBITMQ_PASSWORD = 'srm-test';

/** The test database URL with another role's credentials. */
function asRole(url: string, role: string, password: string): string {
  const target = new URL(url);
  target.username = role;
  target.password = password;
  return target.toString();
}

// Starts one throwaway PostgreSQL (+ pgvector), Redis, MinIO and RabbitMQ for the integration
// project and applies the migrations in apps/api/drizzle. Test workers are spawned after this
// runs, so they inherit the environment set here. Independent of the compose stack.
// PostgreSQL and RabbitMQ also join a Docker network as `postgres` and `rabbitmq`, so a container
// started by a test (the AI Service worker, US-2.1) reaches them like in compose.
export default async function globalSetup(): Promise<void> {
  const network = await new Network().start();
  const results = await Promise.allSettled([
    new PostgreSqlContainer(POSTGRES_IMAGE)
      .withDatabase('srm_test')
      .withUsername('srm')
      .withPassword('srm')
      .withNetwork(network)
      .withNetworkAliases('postgres')
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
    new GenericContainer(RABBITMQ_IMAGE)
      .withExposedPorts(AMQP_PORT, RABBITMQ_UI_PORT)
      .withEnvironment({ RABBITMQ_DEFAULT_USER: RABBITMQ_USER, RABBITMQ_DEFAULT_PASS: RABBITMQ_PASSWORD })
      .withNetwork(network)
      .withNetworkAliases('rabbitmq')
      .withWaitStrategy(Wait.forLogMessage(/Server startup complete/))
      .withStartupTimeout(120_000)
      .start(),
  ]);
  // Jest skips globalTeardown when globalSetup throws; do not leave containers running.
  const stopAll = async () => {
    await Promise.allSettled(results.flatMap((result) => (result.status === 'fulfilled' ? [result.value.stop()] : [])));
    await network.stop().catch(() => undefined);
  };
  const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failed) {
    await stopAll();
    throw failed.reason;
  }
  const [postgres, redis, minio, rabbitmq] = results.map((result) => (result as PromiseFulfilledResult<unknown>).value) as [
    StartedPostgreSqlContainer,
    StartedTestContainer,
    StartedTestContainer,
    StartedTestContainer,
  ];
  globalThis.__SRM_NETWORK__ = network;
  globalThis.__SRM_POSTGRES__ = postgres;
  globalThis.__SRM_REDIS__ = redis;
  globalThis.__SRM_MINIO__ = minio;
  globalThis.__SRM_RABBITMQ__ = rabbitmq;

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
  // The default vhost. A test that consumes ai.results itself uses a vhost of its own
  // (test/helpers/ai-results.ts), so parallel test files never take each other's messages.
  process.env.RABBITMQ_URL = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@${rabbitmq.getHost()}:${rabbitmq.getMappedPort(AMQP_PORT)}`;
  process.env.RABBITMQ_MANAGEMENT_URL = `http://${rabbitmq.getHost()}:${rabbitmq.getMappedPort(RABBITMQ_UI_PORT)}`;
  process.env.TEST_DOCKER_NETWORK = network.getName();
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
