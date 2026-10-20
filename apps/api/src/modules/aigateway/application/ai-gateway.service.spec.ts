import type { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AI_JOB_DISPATCHED } from '../domain/events.js';
import { AiGatewayService } from './ai-gateway.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function setup(publish = jest.fn().mockResolvedValue(true)) {
  const amqp = { managedChannel: { publish } } as unknown as AmqpConnection;
  const events = new EventEmitter2();
  const dispatched: unknown[] = [];
  events.on(AI_JOB_DISPATCHED, (event: unknown) => dispatched.push(event));
  return { service: new AiGatewayService(amqp, events), publish, dispatched };
}

/** The [exchange, routing key, decoded body, options] of the n-th publish. */
function published(publish: jest.Mock, n = 0) {
  const [exchange, queue, content, options] = publish.mock.calls[n] as [string, string, Buffer, Record<string, unknown>];
  return { exchange, queue, body: JSON.parse(content.toString()) as Record<string, unknown>, options };
}

describe('AiGatewayService.dispatch (US-2.1 AC-3)', () => {
  it('AD-5 payload chỉ chứa ID, job_id mới mỗi lần dispatch', async () => {
    const { service, publish } = setup();
    const input = { cv_id: 457, cv_version: 2, file_key: 'cv-files/457-2.pdf' };

    const first = await service.dispatch('CV_PARSE', input);
    const second = await service.dispatch('CV_PARSE', input);

    const sent = published(publish, 0);
    expect(sent.exchange).toBe('');
    expect(sent.queue).toBe('ai.cv.parse');
    expect(Object.keys(sent.body).sort()).toEqual(['cv_id', 'cv_version', 'file_key', 'job_id']);
    expect(sent.body).toEqual(first);
    expect(first.job_id).toMatch(UUID);
    expect(second.job_id).toMatch(UUID);
    expect(second.job_id).not.toBe(first.job_id);
    expect(sent.options).toMatchObject({ persistent: true, messageId: first.job_id, contentType: 'application/json' });
  });

  it('AD-5 sends JD_ANALYZE to ai.jd.analyze with jd_id and jd_version only', async () => {
    const { service, publish } = setup();
    await service.dispatch('JD_ANALYZE', { jd_id: 9, jd_version: 3 });
    const sent = published(publish);
    expect(sent.queue).toBe('ai.jd.analyze');
    expect(Object.keys(sent.body).sort()).toEqual(['jd_id', 'jd_version', 'job_id']);
  });

  it('AD-5 rejects a field outside the contract before publishing', async () => {
    const { service, publish } = setup();
    const withContent = { jd_id: 9, jd_version: 3, raw_text: 'Tuyển thực tập sinh…' };
    await expect(service.dispatch('JD_ANALYZE', withContent)).rejects.toThrow();
    await expect(service.dispatch('CV_PARSE', { cv_id: 0, cv_version: 1, file_key: 'k' })).rejects.toThrow();
    expect(publish).not.toHaveBeenCalled();
  });

  it('AD-5 announces the job only after the broker confirmed it', async () => {
    const { service, dispatched } = setup();
    const job = await service.dispatch('JD_ANALYZE', { jd_id: 9, jd_version: 3 });
    expect(dispatched).toEqual([{ jobId: job.job_id, type: 'JD_ANALYZE', job }]);

    const failing = setup(jest.fn().mockRejectedValue(new Error('timeout')));
    await expect(failing.service.dispatch('JD_ANALYZE', { jd_id: 9, jd_version: 3 })).rejects.toThrow('timeout');
    expect(failing.dispatched).toEqual([]);
  });
});
