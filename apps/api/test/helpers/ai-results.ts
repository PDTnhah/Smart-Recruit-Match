// End-to-end helpers for AI jobs (US-2.1, CONTEXT D33): a RabbitMQ vhost per test file, the AI
// Service worker in a container, and CV_PARSE result messages for the listener of US-2.4.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { AI_RESULTS_QUEUE, type CvParseOutput, type CvPii, type CvProfile } from '@srm/shared';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { BUCKETS, StorageService } from '../../src/common/storage/index.js';
import type { AiResultEvent } from '../../src/modules/aigateway/index.js';
import { aiDatabaseUrl } from './db.js';

const AI_SERVICE_DIR = path.resolve(__dirname, '../../../../ai-service');
/** Sample CVs and recorded LLM replies of the AI Service tests (US-2.4). */
const AI_FIXTURES_DIR = path.join(AI_SERVICE_DIR, 'tests/fixtures');

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
 * the ai_service role (the same image and command as compose's ai-worker). The recorded LLM replies
 * of ai-service/tests/fixtures/llm are copied in, so the sample CVs parse without a real API, and
 * `__fake__/` file keys fail on purpose for the retry and DLQ tests (CONTEXT D37).
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
      // API: a request without a recorded reply fails with LLM_FIXTURE_MISSING.
      LLM_PROVIDER: 'fixture',
      LLM_FIXTURES_DIR: '/tmp/llm-fixtures',
      // The image has no embedding model (US-2.5): the deterministic fake, as compose defaults to.
      EMBEDDING_PROVIDER: 'hashing',
      AI_FAKE_FILE_KEYS: 'true',
      MINIO_ENDPOINT: 'http://minio:9000',
      MINIO_ACCESS_KEY: requiredEnv('MINIO_ACCESS_KEY'),
      MINIO_SECRET_KEY: requiredEnv('MINIO_SECRET_KEY'),
    })
    .withCopyDirectoriesToContainer([{ source: path.join(AI_FIXTURES_DIR, 'llm'), target: '/tmp/llm-fixtures' }])
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

/** Uploads a sample CV of the AI Service tests to `cv-files`, as `POST /api/cvs` would. */
export async function uploadSampleCv(storage: StorageService, studentId: number, campaignId: number): Promise<string> {
  const key = `cv/${studentId}/${campaignId}/${randomUUID()}.pdf`;
  await storage.put(BUCKETS.CV_FILES, key, readFileSync(path.join(AI_FIXTURES_DIR, 'cv/cv.pdf')), 'application/pdf');
  return key;
}

/** A small profile in the shape of CvProfile, with no personal value. */
export const PARSED_PROFILE: CvProfile = {
  summary: 'Thực tập sinh Backend, quan tâm REST API.',
  education: [
    { institution: 'Trường Đại học Demo', degree: 'Kỹ sư', major: 'Công nghệ thông tin', start: '2022', end: null, gpa: '3.2/4' },
  ],
  skills: [
    { name: 'Java', canonical_name: 'Java', match: 'ALIAS' },
    { name: 'Spring Boot', canonical_name: 'Spring Boot', match: 'ALIAS' },
  ],
  projects: [
    {
      name: 'Library API',
      role: 'Backend',
      description: 'REST API bằng Spring Boot, liên hệ [EMAIL].',
      technologies: ['Java'],
      start: '2024',
      end: '2024',
    },
  ],
  experience: [],
  languages: [{ language: 'Tiếng Anh', level: 'TOEIC 650' }],
  certificates: [],
};

/** Personal data of a synthetic student; every value is checked to stay out of audit_logs. */
export const PARSED_PII: CvPii = {
  full_name: 'Trần Thị Kiểm Thử',
  emails: ['kiem.thu.demo@example.com'],
  phones: ['0912 000 111'],
  links: ['https://github.com/kiemthudemo'],
  address: 'Số 9 Đường Kiểm Thử, Hà Nội',
  date_of_birth: '01/02/2004',
  gender: 'FEMALE',
  hometown: 'Nam Định',
  religion: null,
  marital_status: 'SINGLE',
  has_photo: true,
};

/** The text values of PARSED_PII, to search for in stored rows. */
export const PARSED_PII_VALUES = [
  'Trần Thị Kiểm Thử',
  'kiem.thu.demo@example.com',
  '0912 000 111',
  'kiemthudemo',
  'Số 9 Đường Kiểm Thử',
  '01/02/2004',
];

/** A valid CV_PARSE output for a CV version (US-2.4 AC-8). */
export function cvParseOutput(cv: { id: number; version: number }, overrides: Partial<CvParseOutput> = {}): CvParseOutput {
  return {
    prompt_version: 'cv_parser/v1',
    model: 'gemini-3.8-flash',
    cv_id: cv.id,
    cv_version: cv.version,
    source: 'TEXT_PDF',
    profile: PARSED_PROFILE,
    pii: PARSED_PII,
    profile_masked: PARSED_PROFILE,
    new_skills: [],
    masked_text: '[NAME]\nEmail: [EMAIL]\nJava, Spring Boot',
    hidden_text_detected: false,
    ...overrides,
  };
}

interface CvRef {
  id: number;
  version: number;
  fileKey: string;
}

/** A SUCCEEDED `ai.results` message for a CV version, as aigateway hands it to `ai.result.CV_PARSE`. */
export function cvParseSucceeded(
  cv: CvRef,
  overrides: Partial<CvParseOutput> = {},
  jobId: string = randomUUID(),
): AiResultEvent<'CV_PARSE'> {
  return {
    job_id: jobId,
    type: 'CV_PARSE',
    status: 'SUCCEEDED',
    job: { job_id: jobId, cv_id: cv.id, cv_version: cv.version, file_key: cv.fileKey },
    result: cvParseOutput(cv, overrides),
    error: null,
  };
}

/** A FAILED `ai.results` message for a CV version. */
export function cvParseFailed(
  cv: CvRef,
  error: { code: string; hidden_text_detected?: boolean | null } = { code: 'LLM_REFUSED' },
  jobId: string = randomUUID(),
): AiResultEvent<'CV_PARSE'> {
  return {
    job_id: jobId,
    type: 'CV_PARSE',
    status: 'FAILED',
    job: { job_id: jobId, cv_id: cv.id, cv_version: cv.version, file_key: cv.fileKey },
    result: null,
    error: { message: `${error.code} (test)`, needs_human: true, ...error },
  };
}
