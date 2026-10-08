import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@srm/shared';
import { ForbiddenError, UnauthenticatedError } from '../errors/index.js';
import { AccessTokenService } from './access-token.service.js';
import type { AuthenticatedRequest } from './auth-user.js';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators.js';

/**
 * The single global guard (CONTEXT D25): @Public → access token (401) → @Roles (403). One guard
 * instead of two keeps the order explicit. A route without @Roles or @Public is denied.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Message consumers (AD-5) are not HTTP routes; they carry no caller.
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request.headers.authorization);
    if (!token) throw new UnauthenticatedError();
    const user = await this.tokens.verify(token);
    request.user = user;

    const roles = this.reflector.getAllAndOverride<readonly Role[] | undefined>(ROLES_KEY, targets);
    if (!roles?.length) throw new ForbiddenError('Route declares no @Roles()');
    if (!roles.includes(user.role)) throw new ForbiddenError();
    return true;
  }
}

function bearerToken(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string') return null;
  const match = /^Bearer ([^\s]+)$/i.exec(header);
  return match?.[1] ?? null;
}
