import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ZodSerializerInterceptor } from 'nestjs-zod';
import { AuthModule } from './common/auth/index.js';
import { loadEnv } from './common/config/env.js';
import { ApiExceptionFilter } from './common/errors/index.js';
import { ZodRequestValidationPipe } from './common/validation/zod-validation.pipe.js';
import { DbModule } from './db/db.module.js';
import { HealthModule } from './health/health.module.js';
import { IamModule } from './modules/iam/index.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    // The environment is read when the app is built, not when this file is imported.
    LoggerModule.forRootAsync({
      useFactory: () => ({
        pinoHttp: {
          level: loadEnv().LOG_LEVEL,
          // Health probes run every few seconds; keep them out of the request log.
          autoLogging: { ignore: (req) => req.url?.endsWith('/health') ?? false },
          // Tokens must never reach the log (US-1.3 AC-1).
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
          ],
        },
      }),
    }),
    DbModule,
    RedisModule,
    AuthModule,
    HealthModule,
    IamModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodRequestValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
