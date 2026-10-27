import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { loadEnv } from '../common/config/env.js';

export const REDIS = Symbol('REDIS');

// lazyConnect: the client connects on its first command, so building the app (tests, OpenAPI
// export) never needs a reachable Redis.
function createRedis(): Redis {
  const redis = new Redis(loadEnv().REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
  redis.on('error', (error: Error) => new Logger('Redis').error(error.message));
  return redis;
}

@Global()
@Module({
  providers: [{ provide: REDIS, useFactory: createRedis }],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'wait' || this.redis.status === 'end') {
      this.redis.disconnect();
      return;
    }
    await this.redis.quit();
  }
}
