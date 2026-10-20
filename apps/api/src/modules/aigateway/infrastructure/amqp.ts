import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger, type OnApplicationShutdown, type Provider } from '@nestjs/common';
import { AI_QUEUE_OPTIONS, allAiQueues } from '@srm/shared';
import { loadEnv } from '../../../common/config/env.js';

/** A publish not confirmed by the broker within this time fails instead of waiting in memory. */
export const PUBLISH_TIMEOUT_MS = 10_000;

/** Declared identically by the AI Service; RabbitMQ refuses a redeclaration that differs. */
export function aiQueueOptions() {
  return { durable: AI_QUEUE_OPTIONS.durable, arguments: { ...AI_QUEUE_OPTIONS.arguments } };
}

/**
 * One connection per Nest application, built from golevelup's AmqpConnection rather than its
 * RabbitMQModule: the module keeps connections in static state keyed by name, so two apps in one
 * process (integration tests) would share and close each other's connection.
 *
 * `wait: false`: the app starts without a broker (OpenAPI export, broker restart); messages
 * published meanwhile wait in memory up to PUBLISH_TIMEOUT_MS. Every AI queue and its DLQ is
 * declared on each (re)connect.
 */
export const amqpConnectionProvider: Provider = {
  provide: AmqpConnection,
  useFactory: async () => {
    const connection = new AmqpConnection({
      uri: loadEnv().RABBITMQ_URL,
      queues: allAiQueues().map((name) => ({ name, options: aiQueueOptions() })),
      prefetchCount: 10,
      connectionInitOptions: { wait: false },
      enableDirectReplyTo: false,
      registerHandlers: false,
      logger: new Logger(AmqpConnection.name),
    });
    await connection.init();
    return connection;
  },
};

@Injectable()
export class AmqpConnectionCloser implements OnApplicationShutdown {
  constructor(private readonly connection: AmqpConnection) {}

  /** Waits for messages being handled, then closes the connection. */
  async onApplicationShutdown(): Promise<void> {
    await this.connection.close();
  }
}
