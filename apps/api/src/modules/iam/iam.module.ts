import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { loadEnv } from '../../common/config/env.js';
import { REDIS } from '../../redis/redis.module.js';
import { StudentModule } from '../student/index.js';
import { AdminUsersController } from './api/admin-users.controller.js';
import { AuthController } from './api/auth.controller.js';
import { AdminUsersService } from './application/admin-users.service.js';
import { AuthService } from './application/auth.service.js';
import {
  REFRESH_TOKEN_STORE,
  RedisRefreshTokenStore,
} from './infrastructure/refresh-token.store.js';

const SECONDS_PER_DAY = 24 * 60 * 60;

@Module({
  imports: [StudentModule],
  controllers: [AuthController, AdminUsersController],
  providers: [
    AuthService,
    AdminUsersService,
    {
      provide: REFRESH_TOKEN_STORE,
      inject: [REDIS],
      useFactory: (redis: Redis) =>
        new RedisRefreshTokenStore(redis, loadEnv().REFRESH_TOKEN_TTL_DAYS * SECONDS_PER_DAY),
    },
  ],
})
export class IamModule {}
