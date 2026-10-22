import { type AmqpConnection, Nack } from '@golevelup/nestjs-rabbitmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ConsumeMessage } from 'amqplib';
import { AI_JOB_SETTLED, AI_RESULT_EVENTS } from '../domain/events.js';
import { AiResultsConsumer } from './ai-results.consumer.js';

const JOB_ID = '7f6c1e2a-4b8d-4c1e-9a2b-3c4d5e6f7a8b';
const RESULT = {
  job_id: JOB_ID,
  type: 'CV_PARSE',
  status: 'SUCCEEDED',
  job: { job_id: JOB_ID, cv_id: 457, cv_version: 2, file_key: 'cv-files/457-2.pdf' },
  result: { prompt_version: 'fake/v0', model: 'fake' },
  error: null,
};

/** A delivery as amqplib hands it over; `body` is what golevelup parsed from `content`. */
function delivery(content: string, redelivered = false): ConsumeMessage {
  return {
    content: Buffer.from(content),
    fields: { redelivered },
    properties: { headers: { 'x-origin': 'test' }, contentType: 'application/json', messageId: JOB_ID },
  } as unknown as ConsumeMessage;
}

function setup() {
  const publish = jest.fn().mockResolvedValue(true);
  const events = new EventEmitter2();
  const settled: unknown[] = [];
  events.on(AI_JOB_SETTLED, (event: unknown) => settled.push(event));
  const consumer = new AiResultsConsumer({ managedChannel: { publish } } as unknown as AmqpConnection, events);
  return { consumer, events, publish, settled };
}

describe('AiResultsConsumer (US-2.1 AC-4, AC-10)', () => {
  it('AD-6 hands a valid result to the owner and acks it', async () => {
    const { consumer, events, publish, settled } = setup();
    const listener = jest.fn().mockResolvedValue(undefined);
    events.on(AI_RESULT_EVENTS.CV_PARSE, listener);

    await expect(consumer.handle(RESULT, delivery(JSON.stringify(RESULT)))).resolves.toBeUndefined();

    expect(listener.mock.calls).toEqual([[RESULT]]);
    expect(settled).toEqual([{ jobId: JOB_ID, type: 'CV_PARSE', status: 'SUCCEEDED', job: RESULT.job, error: null }]);
    expect(publish).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing job_id', { ...RESULT, job_id: undefined }],
    ['an unknown status', { ...RESULT, status: 'DONE' }],
    ['a FAILED result without error', { ...RESULT, status: 'FAILED', result: null }],
    ['a body that is not JSON', 'not json {'],
  ])('AD-6 ai.results sai schema vào DLQ, consumer không dừng: %s', async (_case, body) => {
    const { consumer, events, publish, settled } = setup();
    const listener = jest.fn();
    events.on(AI_RESULT_EVENTS.CV_PARSE, listener);
    const raw = delivery(typeof body === 'string' ? body : JSON.stringify(body));

    await expect(consumer.handle(body, raw)).resolves.toBeUndefined();

    expect(listener).not.toHaveBeenCalled();
    expect(settled).toEqual([]);
    expect(publish).toHaveBeenCalledTimes(1);
    const [exchange, queue, content, options] = publish.mock.calls[0] as [string, string, Buffer, Record<string, unknown>];
    expect([exchange, queue]).toEqual(['', 'ai.results.dlq']);
    expect(content).toBe(raw.content);
    expect(options).toMatchObject({
      persistent: true,
      messageId: JOB_ID,
      headers: { 'x-origin': 'test', 'x-srm-dlq-reason': 'INVALID_MESSAGE', 'x-srm-source-queue': 'ai.results' },
    });
  });

  it('AD-5 requeues once when a listener fails, then dead-letters the redelivery', async () => {
    const { consumer, events, publish, settled } = setup();
    events.on(AI_RESULT_EVENTS.CV_PARSE, jest.fn().mockRejectedValue(new Error('db down')));

    const first = await consumer.handle(RESULT, delivery(JSON.stringify(RESULT), false));
    expect(first).toBeInstanceOf(Nack);
    expect(first?.requeue).toBe(true);
    expect(publish).not.toHaveBeenCalled();

    await expect(consumer.handle(RESULT, delivery(JSON.stringify(RESULT), true))).resolves.toBeUndefined();
    expect(publish).toHaveBeenCalledWith(
      '',
      'ai.results.dlq',
      expect.any(Buffer),
      expect.objectContaining({ headers: expect.objectContaining({ 'x-srm-dlq-reason': 'LISTENER_FAILED: db down' }) as unknown }),
    );
    expect(settled).toEqual([]);
  });

  it('AD-5 acks a result no module listens to yet', async () => {
    const { consumer, publish, settled } = setup();
    const jd = {
      ...RESULT,
      type: 'JD_ANALYZE',
      status: 'FAILED',
      job: { job_id: JOB_ID, jd_id: 9, jd_version: 1 },
      result: null,
      error: { code: 'LLM_REFUSED', message: 'refused', needs_human: true },
    };
    await expect(consumer.handle(jd, delivery(JSON.stringify(jd)))).resolves.toBeUndefined();
    expect(publish).not.toHaveBeenCalled();
    expect(settled).toHaveLength(1);
  });
});
