import { type Portal, portalForRole } from '@srm/shared';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { FullPageSpinner } from '@/app/pages/full-page-spinner';
import { useSession } from '@/app/session';

/**
 * Lets only the portal's own roles in (US-1.3 AC-11): anonymous → /login (remembering the page),
 * another role → its own portal. The API checks access again on every call (CONTEXT D25).
 */
export function RequirePortal({ portal, children }: { portal: Portal; children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (session.status === 'loading') return <FullPageSpinner />;
  if (session.status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  const own = portalForRole(session.user.role);
  if (own !== portal) return <Navigate to={own} replace />;
  return children;
}

/** `/` → the caller's portal, or /login. */
export function RootRedirect() {
  const session = useSession();
  if (session.status === 'loading') return <FullPageSpinner />;
  if (session.status === 'anonymous') return <Navigate to="/login" replace />;
  return <Navigate to={portalForRole(session.user.role)} replace />;
}
