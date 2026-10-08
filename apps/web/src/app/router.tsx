import type { Portal } from '@srm/shared';
import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { RequirePortal, RootRedirect } from '@/app/guards/require-portal';
import { PortalSidebarLayout } from '@/app/layouts/portal-sidebar-layout';
import { StudentLayout } from '@/app/layouts/student-layout';
import { ComingSoonPage, PortalHomePage } from '@/app/pages/portal-pages';
import { LoginPage } from '@/features/auth/login-page';

// Routes by portal (DESIGN.md §12). A story that ships a screen adds its route next to the
// `:section` placeholder of its portal.

function portalRoute(portal: Portal, layout: ReactNode): RouteObject {
  return {
    path: portal,
    element: <RequirePortal portal={portal}>{layout}</RequirePortal>,
    children: [
      { index: true, element: <PortalHomePage portal={portal} /> },
      { path: ':section', element: <ComingSoonPage portal={portal} /> },
      { path: '*', element: <Navigate to={portal} replace /> },
    ],
  };
}

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/login', element: <LoginPage /> },
  portalRoute('/sv', <StudentLayout />),
  portalRoute('/hr', <PortalSidebarLayout portal="/hr" />),
  portalRoute('/admin', <PortalSidebarLayout portal="/admin" />),
  { path: '*', element: <Navigate to="/" replace /> },
]);
