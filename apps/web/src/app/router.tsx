import { ACCEPT_INVITATION_PATH, type Portal } from '@srm/shared';
import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { RequirePortal, RootRedirect } from '@/app/guards/require-portal';
import { RequireRole } from '@/app/guards/require-role';
import { PortalSidebarLayout } from '@/app/layouts/portal-sidebar-layout';
import { StudentLayout } from '@/app/layouts/student-layout';
import { ComingSoonPage, PortalHomePage } from '@/app/pages/portal-pages';
import { AcceptInvitationPage } from '@/features/auth/accept-invitation-page';
import { LoginPage } from '@/features/auth/login-page';
import { CampaignListPage } from '@/features/center/campaigns/campaign-list-page';
import { CampaignCreatePage, CampaignEditPage } from '@/features/center/campaigns/campaign-pages';
import { CompanyListPage } from '@/features/center/companies/company-list-page';
import { CompanyCreatePage, CompanyDetailPage } from '@/features/center/companies/company-pages';
import { JdApprovalDetailPage } from '@/features/center/jd-approval/jd-approval-detail-page';
import { JdApprovalListPage } from '@/features/center/jd-approval/jd-approval-list-page';
import { HrJdListPage } from '@/features/hr/jds/hr-jd-list-page';
import { HrJdCreatePage, HrJdDetailPage } from '@/features/hr/jds/hr-jd-pages';
import { StudentHomePage } from '@/features/student/home/student-home-page';
import { CvPage } from '@/features/student/profile/cv-page';

// Routes by portal (DESIGN.md §12). A story that ships a screen adds its route next to the
// `:section` placeholder of its portal.

function portalRoute(
  portal: Portal,
  layout: ReactNode,
  pages: RouteObject[] = [],
  home: ReactNode = <PortalHomePage portal={portal} />,
): RouteObject {
  return {
    path: portal,
    element: <RequirePortal portal={portal}>{layout}</RequirePortal>,
    children: [
      { index: true, element: home },
      // Static segments outrank `:section`, so a shipped screen replaces its placeholder.
      ...pages,
      { path: ':section', element: <ComingSoonPage portal={portal} /> },
      { path: '*', element: <Navigate to={portal} replace /> },
    ],
  };
}

function centerOnly(page: ReactNode): ReactNode {
  return <RequireRole roles={['CENTER']}>{page}</RequireRole>;
}

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/login', element: <LoginPage /> },
  // US-1.5: invited HR sets a password; public, outside the portals (DESIGN.md §12).
  { path: ACCEPT_INVITATION_PATH, element: <AcceptInvitationPage /> },
  portalRoute(
    '/sv',
    <StudentLayout />,
    [
      // US-1.6: "Hồ sơ": consent to the terms, CV upload and versions (the /sv portal is STUDENT-only).
      { path: 'cv', element: <CvPage /> },
    ],
    // US-1.6 AC-1: the home lists what to do now, starting with consent and CV for open campaigns.
    <StudentHomePage />,
  ),
  portalRoute('/hr', <PortalSidebarLayout portal="/hr" />, [
    // US-1.5: "JD của tôi" (the /hr portal is HR-only).
    { path: 'job-descriptions', element: <HrJdListPage /> },
    { path: 'job-descriptions/new', element: <HrJdCreatePage /> },
    { path: 'job-descriptions/:id', element: <HrJdDetailPage /> },
  ]),
  portalRoute('/admin', <PortalSidebarLayout portal="/admin" />, [
    // US-1.4: campaign setup belongs to CENTER only (ADMIN reads campaigns through the API).
    { path: 'campaigns', element: centerOnly(<CampaignListPage />) },
    { path: 'campaigns/new', element: centerOnly(<CampaignCreatePage />) },
    { path: 'campaigns/:id', element: centerOnly(<CampaignEditPage />) },
    // US-1.5: companies and HR invitations, JD approval.
    { path: 'companies', element: centerOnly(<CompanyListPage />) },
    { path: 'companies/new', element: centerOnly(<CompanyCreatePage />) },
    { path: 'companies/:id', element: centerOnly(<CompanyDetailPage />) },
    { path: 'job-descriptions', element: centerOnly(<JdApprovalListPage />) },
    { path: 'job-descriptions/:id', element: centerOnly(<JdApprovalDetailPage />) },
  ]),
  { path: '*', element: <Navigate to="/" replace /> },
]);
