import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { HR_INVITATION_TTL_DAYS } from '@srm/shared';
import { z } from 'zod';
import { Clock } from '../clock/index.js';
import { InvitationInvalidError } from '../errors/index.js';

/** `aud` of invitation tokens; access tokens carry none, so neither passes for the other. */
const INVITATION_AUDIENCE = 'hr-invite';

const TTL_SECONDS = HR_INVITATION_TTL_DAYS * 24 * 60 * 60;

const InvitationClaimsSchema = z.object({
  sub: z.string().regex(/^\d+$/),
  aud: z.literal(INVITATION_AUDIENCE),
  nonce: z.string().min(16),
});

export interface SignedInvitation {
  token: string;
  expiresAt: Date;
}

export interface InvitationClaims {
  userId: number;
  /** Must equal users.invitation_nonce: a newer invitation replaces it (CONTEXT D29). */
  nonce: string;
}

/**
 * HR invitation tokens (FR-3, CONTEXT D28, D29): HS256 with the access-token key, `aud = hr-invite`,
 * valid 7 days from the Clock's now. The token carries the invitation's nonce; the accept step
 * requires it to match the account's current one, so a re-invite revokes earlier links.
 */
@Injectable()
export class InvitationTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly clock: Clock,
  ) {}

  async sign(userId: number, nonce: string): Promise<SignedInvitation> {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const exp = iat + TTL_SECONDS;
    const token = await this.jwt.signAsync(
      { sub: String(userId), aud: INVITATION_AUDIENCE, nonce, iat, exp },
      { algorithm: 'HS256' },
    );
    return { token, expiresAt: new Date(exp * 1000) };
  }

  /** The invited user and nonce. A bad signature, expiry, other audience or malformed claims: 422. */
  async verify(token: string): Promise<InvitationClaims> {
    let payload: Record<string, unknown>;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        algorithms: ['HS256'],
        audience: INVITATION_AUDIENCE,
        clockTimestamp: Math.floor(this.clock.now().getTime() / 1000),
      });
    } catch {
      throw new InvitationInvalidError();
    }
    const claims = InvitationClaimsSchema.safeParse(payload);
    if (!claims.success) throw new InvitationInvalidError();
    return { userId: Number(claims.data.sub), nonce: claims.data.nonce };
  }
}
