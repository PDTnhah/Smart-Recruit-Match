import { AmqpConnection, Nack, requeueErrorHandler } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AI_DLQ_HEADERS, AI_RESULTS_QUEUE, AiResultMessageSchema, dlqOf } from '@srm/shared';
import type { ConsumeMessage } from 'amqplib';
import { z } from 'zod';
import { errorMessage } from '../../../common/errors/index.js';
import { emitSafely } from '../../../common/events/emit-safely.js';
import { AI_JOB_SETTLED, AI_RESULT_EVENTS, type AiJobSettledEvent } from '../domain/events.js';
import { PUBLISH_TIMEOUT_MS, aiQueueOptions } from './amqp.js';

const RESULTS_DLQ = dlqOf(AI_RESULTS_QUEUE);

/** The job_id of a message that failed validation, when it has a readable one (for the log). */
function readJobId(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('job_id' in body)) return undefined;
  return typeof body.job_id === 'string' ? body.job_id : undefined;
}

/**
 * Consumes `ai.results` (AD-5, AD-6, CONTEXT D33). Each message is checked with the Zod contract
 * and handed to the owning module as `ai.result.<TYPE>`. The handler settles every message itself,
 * because golevelup's default for a thrown error is to requeue forever:
 * - not JSON or not the contract → logged, copied to `ai.results.dlq`, acked (AC-10);
 * - a listener throws → requeued once; thrown again on the redelivery → dead-lettered.
 */
@Injectable()
export class AiResultsConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiResultsConsumer.name);

  constructor(
    private readonly amqp: AmqpConnection,
    private readonly events: EventEmitter2,
  ) {}

  onApplicationBootstrap(): void {
    // Not awaited: the subscription is set up whenever the broker is reachable, and again after
    // each reconnect, so the API starts without RabbitMQ. Results wait in the durable queue.
    this.amqp
      .createSubscriber<unknown>(
        (body, raw) => this.handle(body, raw),
        {
          queue: AI_RESULTS_QUEUE,
          queueOptions: aiQueueOptions(),
          allowNonJsonMessages: true,
          // Reached only when settling failed, e.g. the DLQ publish was refused: try again later.
          errorHandler: requeueErrorHandler,
        },
        AiResultsConsumer.name,
      )
      .catch((error: unknown) => this.logger.error(`cannot consume ${AI_RESULTS_QUEUE}: ${errorMessage(error)}`));
  }

  /** Returns a Nack to requeue the message; anything else acks it. */
  async handle(body: unknown, raw?: ConsumeMessage): Promise<Nack | undefined> {
    const parsed = AiResultMessageSchema.safeParse(body);
    if (!parsed.success) {
      const jobId = readJobId(body) ?? 'unknown';
      this.logger.warn(`job ${jobId}: invalid ai.results message moved to ${RESULTS_DLQ}: ${z.prettifyError(parsed.error)}`);
      await this.deadLetter(raw, 'INVALID_MESSAGE');
      return undefined;
    }
    const result = parsed.data;
    try {
      await this.events.emitAsync(AI_RESULT_EVENTS[result.type], result);
    } catch (error) {
      if (!raw?.fields.redelivered) {
        this.logger.warn(`job ${result.job_id}: result listener failed, requeued: ${errorMessage(error)}`);
        return new Nack(true);
      }
      this.logger.error(`job ${result.job_id}: result listener failed again, moved to ${RESULTS_DLQ}: ${errorMessage(error)}`);
      await this.deadLetter(raw, `LISTENER_FAILED: ${errorMessage(error)}`);
      return undefined;
    }
    const settled: AiJobSettledEvent = {
      jobId: result.job_id,
      type: result.type,
      status: result.status,
      job: result.job,
      error: result.error,
    };
    emitSafely(this.events, this.logger, AI_JOB_SETTLED, settled);
    return undefined;
  }

  /** Copies the message as received to the DLQ, with the reason in a header. */
  private async deadLetter(raw: ConsumeMessage | undefined, reason: string): Promise<void> {
    if (!raw) return;
    await this.amqp.managedChannel.publish('', RESULTS_DLQ, raw.content, {
      persistent: true,
      contentType: raw.properties.contentType as string | undefined,
      messageId: raw.properties.messageId as string | undefined,
      headers: {
        ...(raw.properties.headers ?? {}),
        [AI_DLQ_HEADERS.reason]: reason.slice(0, 1_000),
        [AI_DLQ_HEADERS.sourceQueue]: AI_RESULTS_QUEUE,
      },
      timeout: PUBLISH_TIMEOUT_MS,
    });
  }
}
