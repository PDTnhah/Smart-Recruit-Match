import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ACCESS_TOKEN_TTL_SECONDS } from '@srm/shared';
import { UnauthenticatedError } from '../errors/index.js';
import { AccessTokenClaimsSchema, type AuthUser, fromClaims, toClaims } from './auth-user.js';

/** Signs and verifies the 15-minute HS256 access token (CONTEXT D25). */
@Injectable()
export class AccessTokenService {
  constructor(private readonly jwt: JwtService) {}

  sign(user: AuthUser): Promise<string> {
    return this.jwt.signAsync(toClaims(user), {
      algorithm: 'HS256',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  /** Any failure (bad signature, expired, malformed claims) is a plain 401. */
  async verify(token: string): Promise<AuthUser> {
    let payload: Record<string, unknown>;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(token, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthenticatedError('Invalid or expired access token');
    }
    const claims = AccessTokenClaimsSchema.safeParse(payload);
    if (!claims.success) throw new UnauthenticatedError('Invalid or expired access token');
    return fromClaims(claims.data);
  }

  /**
   * Expiry of a token that AccessGuard has already verified, or null without `exp`. The SSE stream
   * ends then, so a revoked session stops listening when its token expires (CONTEXT D31).
   */
  expiresAt(token: string): Date | null {
    const payload = this.jwt.decode<{ exp?: unknown } | null>(token);
    return typeof payload?.exp === 'number' ? new Date(payload.exp * 1000) : null;
  }
}
