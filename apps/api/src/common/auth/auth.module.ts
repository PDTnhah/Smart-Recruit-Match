import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { loadEnv } from '../config/env.js';
import { AccessGuard } from './access.guard.js';
import { AccessTokenService } from './access-token.service.js';
import { InvitationTokenService } from './invitation-token.service.js';

/**
 * Registers the global AccessGuard and exports the token services iam signs with: access tokens
 * (CONTEXT D25) and HR invitation tokens (CONTEXT D28).
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({ secret: loadEnv().JWT_ACCESS_SECRET }),
    }),
  ],
  providers: [AccessTokenService, InvitationTokenService, { provide: APP_GUARD, useClass: AccessGuard }],
  exports: [AccessTokenService, InvitationTokenService],
})
export class AuthModule {}
