import { Module } from '@nestjs/common';
import { AiGatewayService } from './application/ai-gateway.service.js';
import { AiResultsConsumer } from './infrastructure/ai-results.consumer.js';
import { AmqpConnectionCloser, amqpConnectionProvider } from './infrastructure/amqp.js';

/**
 * Bridge to the AI Service over RabbitMQ (ARCHITECTURE › Các module, AD-5, CONTEXT D33): sends
 * jobs and turns `ai.results` into `ai.result.<TYPE>` events. Owns no table; relies on the global
 * EventEmitterModule. Modules that start AI jobs import this one and call `AiGatewayService.dispatch`.
 */
@Module({
  providers: [amqpConnectionProvider, AmqpConnectionCloser, AiGatewayService, AiResultsConsumer],
  exports: [AiGatewayService],
})
export class AiGatewayModule {}
