// US-2.1 AC-4 … AC-7, AC-10 (AD-5, AD-6, NFR-10, CONTEXT D33): jobs through the real pipeline,
// backend → RabbitMQ → AI Service worker (container built from ai-service/, fake handlers) →
// ai.results → backend. The worker connects as ai_service, the API as api_service.
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import type { CvStatus } from '@srm/shared';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import type { StartedTestContainer } from 'testcontainers';
import { cvs } from '../../src/db/schema/index.js';
import {
  AI_JOB_DISPATCHED,
  AI_JOB_SETTLED,
  AiGatewayService,
  type AiJobDispatchedEvent,
  type AiJobSettledEvent,
} from '../../src/modules/aigateway/index.js';
import {
  type RabbitVhost,
  ReferenceCvResultListenerModule,
  createVhost,
  deliverTwice,
  queueDepth,
  startAiWorker,
} from '../helpers/ai-results.js';
import { type AuthTestApp, createAuthTestApp } from '../helpers/auth.js';
import { ownerDatabaseUrl } from '../helpers/db.js';
import { createCv } from '../helpers/factories.js';
import { captureEvents } from '../helpers/jd.js';
import { waitFor } from '../helpers/notifications.js';
import { auditEntries } from '../helpers/state.js';

const JOBS_DLQ = 'ai.cv.parse.dlq';
const RESULTS_DLQ = 'ai.results.dlq';
const FAKE_OUTPUT = { prompt_version: 'fake/v0', model: 'fake' };

interface JobRow {
  status: string;
  attempts: number;
  last_error: string | null;
  finished_at: Date | null;
}

describe('AD-5: AI jobs round trip through RabbitMQ and the AI Service', () => {
  let vhost: RabbitVhost;
  let worker: StartedTestContainer;
  let t: AuthTestApp;
  let gateway: AiGatewayService;
  let amqp: AmqpConnection;
  let owner: Client;
  let dispatched: AiJobDispatchedEvent[];
  let settled: AiJobSettledEvent[];

  beforeAll(async () => {
    vhost = await createVhost(`roundtrip-${process.pid}`);
    // Read when the app is built; only this file's app consumes this vhost's ai.results.
    process.env.RABBITMQ_URL = vhost.url;
    // One after the other, so afterAll can close whatever started if the other step fails.
    t = await createAuthTestApp({ imports: [ReferenceCvResultListenerModule] });
    gateway = t.app.get(AiGatewayService);
    amqp = t.app.get(AmqpConnection);
    dispatched = captureEvents(t.app, AI_JOB_DISPATCHED);
    settled = captureEvents(t.app, AI_JOB_SETTLED);
    owner = new Client({ connectionString: ownerDatabaseUrl() });
    await owner.connect();
    await waitFor(() => Promise.resolve(amqp.connected ? true : undefined), 30_000);
    // Builds ai-service/Dockerfile: minutes on a cold cache, seconds once the image exists.
    worker = await startAiWorker(vhost);
  }, 900_000);

  afterAll(async () => {
    await t?.close();
    await worker?.stop();
    await owner?.end();
    await vhost?.remove();
  });

  const settledFor = (jobId: string) => settled.filter((event) => event.jobId === jobId);

  const waitSettled = (jobId: string, count = 1, timeoutMs = 30_000) =>
    waitFor(() => Promise.resolve(settledFor(jobId).length >= count ? settledFor(jobId) : undefined), timeoutMs);

  /** The ai.jobs row once the worker has marked it finished. */
  const finishedJob = (jobId: string) =>
    waitFor(async () => {
      const { rows } = await owner.query<JobRow>(
        'SELECT status, attempts, last_error, finished_at FROM ai.jobs WHERE job_id = $1',
        [jobId],
      );
      return rows[0]?.finished_at ? rows[0] : undefined;
    }, 10_000);

  const cvStatus = async (id: number): Promise<CvStatus | undefined> =>
    (await t.db.select({ status: cvs.status }).from(cvs).where(eq(cvs.id, id)))[0]?.status;

  const dispatchCv = (cv: { id: number; version: number; fileKey: string }) =>
    gateway.dispatch('CV_PARSE', { cv_id: cv.id, cv_version: cv.version, file_key: cv.fileKey });

  it('AD-5 job đi trọn vòng backend → RabbitMQ → AI Service → ai.results → backend', async () => {
    const cv = await createCv(t.db);
    const job = await dispatchCv(cv);
    expect(dispatched.filter((event) => event.jobId === job.job_id)).toEqual([
      { jobId: job.job_id, type: 'CV_PARSE', job },
    ]);

    const [event] = await waitSettled(job.job_id);

    expect(event).toEqual({ jobId: job.job_id, type: 'CV_PARSE', status: 'SUCCEEDED', job, error: null });
    expect(await finishedJob(job.job_id)).toMatchObject({ status: 'SUCCEEDED', attempts: 1, last_error: null });
    // The owning module received the result: the reference listener moved the CV on.
    expect(await cvStatus(cv.id)).toBe('PENDING_CONFIRMATION');
  });

  it('AD-5 nhận trùng ai.results không ghi trùng', async () => {
    const cv = await createCv(t.db);
    const jobId = randomUUID();
    const job = { job_id: jobId, cv_id: cv.id, cv_version: cv.version, file_key: cv.fileKey };

    await deliverTwice(amqp, { job_id: jobId, type: 'CV_PARSE', status: 'SUCCEEDED', job, result: FAKE_OUTPUT, error: null });
    await waitSettled(jobId, 2);

    expect(await cvStatus(cv.id)).toBe('PENDING_CONFIRMATION');
    expect(await auditEntries(t.db, 'cv', cv.id)).toHaveLength(1);
    expect(await queueDepth(amqp, RESULTS_DLQ)).toBe(0);
  });

  it('AD-5 job trùng job_id không chạy lại', async () => {
    const cv = await createCv(t.db);
    const job = await dispatchCv(cv);
    await waitSettled(job.job_id);
    await finishedJob(job.job_id);

    // The broker delivers the finished job again, then a later job on the same queue: once the
    // later one is back, the duplicate has been handled.
    await amqp.managedChannel.publish('', 'ai.cv.parse', Buffer.from(JSON.stringify(job)), {
      persistent: true,
      contentType: 'application/json',
    });
    const later = await dispatchCv(await createCv(t.db));
    await waitSettled(later.job_id);

    expect(settledFor(job.job_id)).toHaveLength(1);
    expect(await finishedJob(job.job_id)).toMatchObject({ status: 'SUCCEEDED', attempts: 1 });
  });

  it('NFR-10 lỗi tạm thời 3 lần vào DLQ', async () => {
    const before = await queueDepth(amqp, JOBS_DLQ);
    const cv = await createCv(t.db, { fileKey: `__fake__/retryable/${randomUUID()}.pdf` });
    const job = await dispatchCv(cv);

    // Attempts 2 and 3 start after 2 s and 10 s.
    const [event] = await waitSettled(job.job_id, 1, 60_000);

    expect(event).toMatchObject({ status: 'FAILED', job, error: { code: 'RETRIES_EXHAUSTED', needs_human: true } });
    const row = await finishedJob(job.job_id);
    expect(row).toMatchObject({ status: 'FAILED', attempts: 3 });
    expect(row.last_error).toMatch(/^RETRIES_EXHAUSTED: RetryableError: fake transient failure/);
    await waitFor(async () => ((await queueDepth(amqp, JOBS_DLQ)) === before + 1 ? true : undefined), 10_000);
    const dead = await amqp.channel.get(JOBS_DLQ, { noAck: true });
    if (!dead) throw new Error(`${JOBS_DLQ} is empty`);
    expect(JSON.parse(dead.content.toString())).toEqual(job);
    expect(dead.properties.headers).toMatchObject({ 'x-srm-attempts': 3, 'x-srm-source-queue': 'ai.cv.parse' });
    // A FAILED result leaves the CV waiting; the owning module decides what to show (US-2.4).
    expect(await cvStatus(cv.id)).toBe('PENDING_ANALYSIS');
  });

  it('AD-5 lỗi không hồi phục thất bại ngay, không thử lại, cần người xử lý (AC-7)', async () => {
    const before = await queueDepth(amqp, JOBS_DLQ);
    const job = await dispatchCv(await createCv(t.db, { fileKey: `__fake__/permanent/${randomUUID()}.pdf` }));

    const [event] = await waitSettled(job.job_id);

    expect(event).toMatchObject({ status: 'FAILED', error: { code: 'FAKE_PERMANENT', needs_human: true } });
    expect(await finishedJob(job.job_id)).toMatchObject({ status: 'FAILED', attempts: 1 });
    expect(await queueDepth(amqp, JOBS_DLQ)).toBe(before);
  });

  it('AD-6 ai.results sai schema vào DLQ, consumer không dừng', async () => {
    const before = await queueDepth(amqp, RESULTS_DLQ);
    const options = { persistent: true, contentType: 'application/json' };
    await amqp.managedChannel.publish('', 'ai.results', Buffer.from(JSON.stringify({ type: 'CV_PARSE', status: 'DONE' })), options);
    await amqp.managedChannel.publish('', 'ai.results', Buffer.from('not json {'), options);

    await waitFor(async () => ((await queueDepth(amqp, RESULTS_DLQ)) === before + 2 ? true : undefined), 10_000);

    // Still consuming: a valid result sent afterwards is handled.
    const cv = await createCv(t.db);
    const jobId = randomUUID();
    const job = { job_id: jobId, cv_id: cv.id, cv_version: cv.version, file_key: cv.fileKey };
    await amqp.managedChannel.publish(
      '',
      'ai.results',
      Buffer.from(JSON.stringify({ job_id: jobId, type: 'CV_PARSE', status: 'SUCCEEDED', job, result: FAKE_OUTPUT, error: null })),
      options,
    );
    await waitSettled(jobId);
    expect(await cvStatus(cv.id)).toBe('PENDING_CONFIRMATION');
  });
});
