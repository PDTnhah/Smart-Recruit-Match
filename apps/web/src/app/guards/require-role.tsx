import { portalForRole, type Role } from '@srm/shared';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useCurrentUser } from '@/app/session';

/**
 * A screen of a portal that only some of its roles use (e.g. CENTER inside /admin). Other roles go
 * back to their portal home; the API still checks every call (CONTEXT D25).
 */
export function RequireRole({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const user = useCurrentUser();
  if (!roles.includes(user.role)) return <Navigate to={portalForRole(user.role)} replace />;
  return children;
}
