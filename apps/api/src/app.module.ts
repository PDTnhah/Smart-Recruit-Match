import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { loadEnv } from './common/config/env.js';
import { DomainErrorFilter } from './common/errors/index.js';
import { DbModule } from './db/db.module.js';
import { HealthModule } from './health/health.module.js';

const env = loadEnv();

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.LOG_LEVEL,
        // Health probes run every few seconds; keep them out of the request log.
        autoLogging: { ignore: (req) => req.url?.endsWith('/health') ?? false },
      },
    }),
    DbModule,
    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: DomainErrorFilter }],
})
export class AppModule {}
