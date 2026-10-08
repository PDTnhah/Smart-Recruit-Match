export { AuthModule } from './auth.module.js';
export { AccessTokenService } from './access-token.service.js';
export { AccessGuard } from './access.guard.js';
export {
  AccessTokenClaimsSchema,
  authUserFromRow,
  type AccessTokenClaims,
  type AuthenticatedRequest,
  type AuthUser,
} from './auth-user.js';
export { CurrentUser, IS_PUBLIC_KEY, Public, ROLES_KEY, Roles } from './decorators.js';
export {
  assertRecordAccess,
  canAccessRecord,
  recordScopeWhere,
  type RecordScope,
  type ScopeColumns,
} from './record-access.js';
