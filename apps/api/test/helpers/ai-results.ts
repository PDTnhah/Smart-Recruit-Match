// End-to-end helpers for AI jobs (US-2.1, CONTEXT D33): a RabbitMQ vhost per test file, the AI
// Service worker in a container, and a reference listener of `ai.result.CV_PARSE` that later
// stories (US-2.3, US-2.4) copy for their real listeners and test with `deliverTwice`.
import path from 'node:path';
import type { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Inject, Injectable, Module } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AI_RESULTS_QUEUE } from '@srm/shared';
import { eq } from 'drizzle-orm';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { StateModule, StateTransitionService } from '../../src/common/state/index.js';
import { cvLifecycle } from '../../src/db/lifecycles.js';
import { cvs } from '../../src/db/schema/index.js';
import { DRIZZLE } from '../../src/db/tokens.js';
import type { Database } from '../../src/db/types.js';
import { AI_RESULT_EVENTS, type AiResultEvent } from '../../src/modules/aigateway/index.js';
import { SYSTEM_ACTOR } from '../../src/modules/audit/index.js';
import { aiDatabaseUrl } from './db.js';

const AI_SERVICE_DIR = path.resolve(__dirname, '../../../../ai-service');

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} not set — integration global setup did not run`);
  return value;
}

export interface RabbitVhost {
  name: string;
  /** For the API under test, from the host. */
  url: string;
  /** For a container on the test network. */
  networkUrl: string;
  remove(): Promise<void>;
}

/**
 * A vhost of its own, so this file's AiResultsConsumer is the only consumer of its `ai.results`:
 * every Nest app of the other test files consumes `ai.results` on the default vhost.
 */
export async function createVhost(name: string): Promise<RabbitVhost> {
  const amqp = new URL(requiredEnv('RABBITMQ_URL'));
  const user = decodeURIComponent(amqp.username);
  const auth = `Basic ${Buffer.from(`${user}:${decodeURIComponent(amqp.password)}`).toString('base64')}`;
  const management = requiredEnv('RABBITMQ_MANAGEMENT_URL');
  const call = async (method: string, route: string, body?: object) => {
    const response = await fetch(`${management}${route}`, {
      method,
      headers: { authorization: auth, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`RabbitMQ management ${method} ${route}: ${response.status}`);
  };
  const vhost = encodeURIComponent(name);
  await call('PUT', `/api/vhosts/${vhost}`);
  await call('PUT', `/api/permissions/${vhost}/${encodeURIComponent(user)}`, {
    configure: '.*',
    write: '.*',
    read: '.*',
  });
  amqp.pathname = `/${vhost}`;
  const inNetwork = new URL(amqp);
  inNetwork.hostname = 'rabbitmq';
  inNetwork.port = '5672';
  return { name, url: amqp.toString(), networkUrl: inNetwork.toString(), remove: () => call('DELETE', `/api/vhosts/${vhost}`) };
}

/**
 * Builds ai-service/Dockerfile and runs the FastStream worker on the test network, connected as
 * the ai_service role (the same image and command as compose's ai-worker).
 */
export async function startAiWorker(vhost: RabbitVhost): Promise<StartedTestContainer> {
  // Kept after the run: the dependency layer is then reused, so only a changed app/ rebuilds.
  const image = await GenericContainer.fromDockerfile(AI_SERVICE_DIR).build('srm-ai-service-test', {
    deleteOnExit: false,
  });
  const database = new URL(aiDatabaseUrl());
  database.hostname = 'postgres';
  database.port = '5432';
  return image
    .withNetworkMode(requiredEnv('TEST_DOCKER_NETWORK'))
    .withEnvironment({
      AI_DATABASE_URL: database.toString(),
      RABBITMQ_URL: vhost.networkUrl,
      LOG_LEVEL: 'info',
      // The worker builds its LLMClient at startup (US-2.3). Recorded replies only, never a real
      // API; the directory is empty in the image, so a JD job here would fail with a missing fixture.
      LLM_PROVIDER: 'fixture',
      LLM_FIXTURES_DIR: '/tmp/llm-fixtures',
      MINIO_ENDPOINT: 'http://minio:9000',
      MINIO_ACCESS_KEY: requiredEnv('MINIO_ACCESS_KEY'),
      MINIO_SECRET_KEY: requiredEnv('MINIO_SECRET_KEY'),
    })
    .withCommand(['faststream', 'run', 'app.worker:create_app', '--factory'])
    .withWaitStrategy(Wait.forLogMessage(/ai-worker ready/))
    .withStartupTimeout(120_000)
    .start();
}

/** Publishes the same `ai.results` message twice, as an at-least-once broker may (AC-5). */
export async function deliverTwice(amqp: AmqpConnection, message: object): Promise<void> {
  const body = Buffer.from(JSON.stringify(message));
  for (let i = 0; i < 2; i += 1) {
    await amqp.managedChannel.publish('', AI_RESULTS_QUEUE, body, { persistent: true, contentType: 'application/json' });
  }
}

/** Ready messages in a queue of the vhost the app is connected to. */
export async function queueDepth(amqp: AmqpConnection, queue: string): Promise<number> {
  return (await amqp.channel.checkQueue(queue)).messageCount;
}

/**
 * Reference listener, written to the convention in aigateway/domain/events.ts (CONTEXT D33). It
 * only moves the CV to PENDING_CONFIRMATION; US-2.4 also stores the profile. A result already
 * applied or for a replaced version returns quietly; a concurrent duplicate loses the row lock
 * race, throws, is requeued once and then returns quietly.
 */
@Injectable()
export class ReferenceCvResultListener {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly transitions: StateTransitionService,
  ) {}

  @OnEvent(AI_RESULT_EVENTS.CV_PARSE, { suppressErrors: false })
  async apply(result: AiResultEvent<'CV_PARSE'>): Promise<void> {
    if (result.status === 'FAILED') return;
    const [cv] = await this.db
      .select({ status: cvs.status, version: cvs.version })
      .from(cvs)
      .where(eq(cvs.id, result.job.cv_id));
    if (!cv || cv.version !== result.job.cv_version || cv.status !== 'PENDING_ANALYSIS') return;
    await this.transitions.transitionTo({
      lifecycle: cvLifecycle,
      id: result.job.cv_id,
      to: 'PENDING_CONFIRMATION',
      actor: SYSTEM_ACTOR,
      reason: `AI job ${result.job_id}`,
    });
  }
}

@Module({ imports: [StateModule], providers: [ReferenceCvResultListener] })
export class ReferenceCvResultListenerModule {}
