import { MeSchema, type Portal } from '@srm/shared';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, Construction, House } from 'lucide-react';
import { Navigate, useParams } from 'react-router';
import { navigationFor, PORTAL_TITLES } from '@/app/navigation';
import { ROLE_LABELS } from '@/app/roles';
import { useCurrentUser } from '@/app/session';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { api, unwrap } from '@/shared/api/client';
import { apiErrorMessage } from '@/shared/api/errors';

/** The account as the API sees it now; goes through the client's refresh-once path (AC-4). */
function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => MeSchema.parse(unwrap(await api.GET('/api/me'))),
  });
}

/**
 * Portal home until the dashboards of later stories exist. Also the reference for the four
 * states of DESIGN.md §7: Skeleton while loading, Alert with retry on error, Empty, data.
 */
export function PortalHomePage({ portal }: { portal: Portal }) {
  const me = useMe();

  if (me.isPending) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-8 w-2/3 max-w-sm" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (me.isError) {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Không tải được thông tin tài khoản</AlertTitle>
        <AlertDescription>{apiErrorMessage(me.error)}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void me.refetch()}>
            Thử lại
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  const user = me.data;
  return (
    <>
      <h1 className="font-heading text-xl font-semibold md:text-2xl">
        Xin chào, {user.fullName ?? user.email}
      </h1>
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <House />
          </EmptyMedia>
          <EmptyTitle>{PORTAL_TITLES[portal]}</EmptyTitle>
          <EmptyDescription>
            Đăng nhập với vai trò {ROLE_LABELS[user.role]}. Các việc cần làm sẽ hiện ở đây khi đợt thực tập
            bắt đầu.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  );
}

/** A menu item whose screen belongs to a later story; unknown or other-role items go home. */
export function ComingSoonPage({ portal }: { portal: Portal }) {
  const user = useCurrentUser();
  const { section } = useParams();
  const item = navigationFor(portal, user.role).find((candidate) => candidate.segment === section);
  if (!item || item.segment === '') return <Navigate to={portal} replace />;
  return (
    <>
      <h1 className="font-heading text-xl font-semibold md:text-2xl">{item.title}</h1>
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Construction />
          </EmptyMedia>
          <EmptyTitle>Chức năng đang được xây dựng</EmptyTitle>
          <EmptyDescription>Mục này sẽ dùng được trong các bản cập nhật tới.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  );
}
