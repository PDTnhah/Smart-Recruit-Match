import {
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Role } from '@srm/shared';
import { UnauthenticatedError } from '../errors/index.js';
import type { AuthenticatedRequest, AuthUser } from './auth-user.js';

export const IS_PUBLIC_KEY = 'srm:auth:public';
export const ROLES_KEY = 'srm:auth:roles';

/** Opens a route to anonymous callers. Every other route must declare @Roles (deny by default). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Roles allowed on a controller or handler; a handler-level declaration overrides the class. */
export const Roles = (...roles: [Role, ...Role[]]) =>
  applyDecorators(SetMetadata(ROLES_KEY, roles), ApiBearerAuth());

/** The authenticated caller set by AccessGuard. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
  if (!user) throw new UnauthenticatedError();
  return user;
});
