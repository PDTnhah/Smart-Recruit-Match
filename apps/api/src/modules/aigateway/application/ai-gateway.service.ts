import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AI_JOB_QUEUES, AI_JOB_SCHEMAS, type AiJobInput, type AiJobPayload, type AiJobType } from '@srm/shared';
import { randomUUID } from 'node:crypto';
import { emitSafely } from '../../../common/events/emit-safely.js';
import { AI_JOB_DISPATCHED, type AiJobDispatchedEvent } from '../domain/events.js';
import { PUBLISH_TIMEOUT_MS } from '../infrastructure/amqp.js';

/** Sends AI jobs to RabbitMQ (AD-5, ARCHITECTURE › Hàng đợi, CONTEXT D33). */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(
    private readonly amqp: AmqpConnection,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Publishes one job with a new `job_id` and resolves once the broker has confirmed it. The
   * payload holds IDs only and is checked against the strict contract first, so a field outside
   * ARCHITECTURE › Hàng đợi throws here instead of reaching the AI Service.
   *
   * Call it after the business transaction has committed: a job must never point at a row that
   * may still roll back, which is why it takes no `tx`. A rejection (broker unreachable for
   * PUBLISH_TIMEOUT_MS) leaves the item waiting; there is no outbox yet (US-2.1 › What we did NOT do).
   */
  async dispatch<T extends AiJobType>(type: T, input: AiJobInput<T>): Promise<AiJobPayload<T>> {
    const job = AI_JOB_SCHEMAS[type].parse({ ...input, job_id: randomUUID() }) as AiJobPayload<T>;
    await this.amqp.managedChannel.publish('', AI_JOB_QUEUES[type], Buffer.from(JSON.stringify(job)), {
      persistent: true,
      contentType: 'application/json',
      messageId: job.job_id,
      type,
      timeout: PUBLISH_TIMEOUT_MS,
    });
    const event: AiJobDispatchedEvent<T> = { jobId: job.job_id, type, job };
    emitSafely(this.events, this.logger, AI_JOB_DISPATCHED, event);
    return job;
  }
}
