import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { loadEnv } from '../config/env.js';
import { AccessGuard } from './access.guard.js';
import { AccessTokenService } from './access-token.service.js';

/** Registers the global AccessGuard and exports AccessTokenService (used by iam to sign tokens). */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({ secret: loadEnv().JWT_ACCESS_SECRET }),
    }),
  ],
  providers: [AccessTokenService, { provide: APP_GUARD, useClass: AccessGuard }],
  exports: [AccessTokenService],
})
export class AuthModule {}
