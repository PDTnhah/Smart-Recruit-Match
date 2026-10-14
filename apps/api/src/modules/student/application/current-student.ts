import type { AuthUser } from '../../../common/auth/index.js';
import { ForbiddenError } from '../../../common/errors/index.js';

/** The caller's student id, always from the access token, never from a request (AGENTS › Invariant 7). */
export function studentIdOf(user: AuthUser): number {
  if (user.role !== 'STUDENT') throw new ForbiddenError('Only students consent and submit CVs');
  return user.studentId;
}
