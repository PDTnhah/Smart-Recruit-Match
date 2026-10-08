import type { Portal } from '@srm/shared';
import { GraduationCap } from 'lucide-react';
import { Link, matchPath, NavLink, Outlet, useLocation } from 'react-router';
import { AccountMenu } from '@/app/layouts/account-menu';
import { type NavItem, navigationFor, navItemPath, PORTAL_TITLES } from '@/app/navigation';
import { useCurrentUser } from '@/app/session';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';

function isActive(portal: Portal, item: NavItem, pathname: string): boolean {
  return matchPath({ path: navItemPath(portal, item), end: item.segment === '' }, pathname) !== null;
}

function PortalNav({ portal, items }: { portal: Portal; items: NavItem[] }) {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.segment}>
          <SidebarMenuButton asChild isActive={isActive(portal, item, pathname)} tooltip={item.title}>
            <NavLink to={navItemPath(portal, item)} end={item.segment === ''} onClick={() => setOpenMobile(false)}>
              <item.icon />
              <span>{item.title}</span>
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

/**
 * HR and Center portal shell (DESIGN.md §12): collapsible sidebar on desktop, Sheet under `md`.
 * CENTER and ADMIN share /admin with different menus (CONTEXT D25).
 */
export function PortalSidebarLayout({ portal }: { portal: Portal }) {
  const user = useCurrentUser();
  const { pathname } = useLocation();
  const items = navigationFor(portal, user.role);
  const current = items.find((item) => isActive(portal, item, pathname));

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to={portal}>
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <GraduationCap className="size-4" />
                  </div>
                  <div className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate font-semibold">Smart Recruit Match</span>
                    <span className="truncate text-xs">{PORTAL_TITLES[portal]}</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Chức năng</SidebarGroupLabel>
            <SidebarGroupContent>
              <PortalNav portal={portal} items={items} />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter />
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <span className="min-w-0 truncate font-medium">{current?.title ?? PORTAL_TITLES[portal]}</span>
          <div className="ml-auto">
            <AccountMenu />
          </div>
        </header>
        <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
