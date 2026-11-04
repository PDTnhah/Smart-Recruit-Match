import type { AuthUser } from '../../../common/auth/index.js';
import { ForbiddenError } from '../../../common/errors/index.js';

/**
 * The caller's student id, always from the access token, never from a request (AGENTS › Invariant 7).
 * Exported for the `/me/*` routes of other modules (US-3.3).
 */
export function studentIdOf(user: AuthUser): number {
  if (user.role !== 'STUDENT') throw new ForbiddenError('Only students act on their own records here');
  return user.studentId;
}
