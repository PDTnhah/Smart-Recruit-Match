import { Link, NavLink, Outlet } from 'react-router';
import { AccountMenu } from '@/app/layouts/account-menu';
import { navigationFor, navItemPath } from '@/app/navigation';
import { useCurrentUser } from '@/app/session';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Student portal shell, mobile first (DESIGN.md §5, §12): header plus a fixed bottom bar under
 * `md`; links in the header from `md` up. Content is one column, max-w-3xl.
 */
export function StudentLayout() {
  const user = useCurrentUser();
  const items = navigationFor('/sv', user.role);

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-4 px-4">
          <Link to="/sv" className="min-w-0 truncate font-heading font-semibold">
            Smart Recruit Match
          </Link>
          <nav aria-label="Điều hướng chính" className="ml-auto hidden items-center gap-1 md:flex">
            {items.map((item) => (
              <Button key={item.segment} variant="ghost" asChild>
                <NavLink
                  to={navItemPath('/sv', item)}
                  end={item.segment === ''}
                  className="aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
                >
                  {item.title}
                </NavLink>
              </Button>
            ))}
          </nav>
          <div className="ml-auto md:ml-0">
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col gap-6 p-4 pb-24 md:p-6">
        <Outlet />
      </main>

      <nav
        aria-label="Điều hướng chính"
        className="fixed inset-x-0 bottom-0 z-10 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid auto-cols-fr grid-flow-col">
          {items.map((item) => (
            <li key={item.segment} className="min-w-0">
              <NavLink
                to={navItemPath('/sv', item)}
                end={item.segment === ''}
                className={({ isActive }) =>
                  cn(
                    'flex h-14 flex-col items-center justify-center gap-1 px-1 text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )
                }
              >
                <item.icon aria-hidden="true" className="size-5" />
                <span className="max-w-full truncate">{item.title}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
