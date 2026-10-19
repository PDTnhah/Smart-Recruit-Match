import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { loadEnv } from '../../common/config/env.js';
import { REDIS } from '../../redis/redis.module.js';
import { AuditModule } from '../audit/index.js';
import { StudentModule } from '../student/index.js';
import { AdminUsersController } from './api/admin-users.controller.js';
import { AuthController } from './api/auth.controller.js';
import { AdminUsersService } from './application/admin-users.service.js';
import { AuthService } from './application/auth.service.js';
import { InvitationService } from './application/invitation.service.js';
import { UserDirectory } from './application/user-directory.service.js';
import {
  REFRESH_TOKEN_STORE,
  RedisRefreshTokenStore,
} from './infrastructure/refresh-token.store.js';

const SECONDS_PER_DAY = 24 * 60 * 60;

@Module({
  imports: [StudentModule, AuditModule],
  controllers: [AuthController, AdminUsersController],
  providers: [
    AuthService,
    AdminUsersService,
    InvitationService,
    UserDirectory,
    {
      provide: REFRESH_TOKEN_STORE,
      inject: [REDIS],
      useFactory: (redis: Redis) =>
        new RedisRefreshTokenStore(redis, loadEnv().REFRESH_TOKEN_TTL_DAYS * SECONDS_PER_DAY),
    },
  ],
  // The company module invites HR accounts through InvitationService; the notification module
  // finds recipients through UserDirectory (AGENTS › Invariant 13).
  exports: [InvitationService, UserDirectory],
})
export class IamModule {}
