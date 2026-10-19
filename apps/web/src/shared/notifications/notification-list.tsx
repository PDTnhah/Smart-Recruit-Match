import type { Notification } from '@srm/shared';
import { BellOff, CircleAlert } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { formatDateTime, formatRelative } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { useMarkAllRead, useMarkRead, useNotifications } from './api';
import { describeNotification } from './messages';

/**
 * The caller's notifications inside the bell (US-1.7 AC-7), with the four states of DESIGN.md §7.
 * Selecting one marks it read and opens its page; `onNavigate` closes the popover or sheet.
 */
export function NotificationList({ onNavigate }: { onNavigate: () => void }) {
  const notifications = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const navigate = useNavigate();

  if (notifications.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (notifications.isError) {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Không tải được thông báo</AlertTitle>
        <AlertDescription>{apiErrorMessage(notifications.error)}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void notifications.refetch()}>
            Thử lại
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  const items = notifications.data.pages.flatMap((page) => page.items);
  const unread = notifications.data.pages[0]?.unreadCount ?? 0;

  if (items.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BellOff />
          </EmptyMedia>
          <EmptyTitle>Chưa có thông báo</EmptyTitle>
          <EmptyDescription>Tin về đợt thực tập, hạn chót và kết quả sẽ hiện ở đây.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  function open(notification: Notification) {
    if (notification.readAt === null) {
      markRead.mutate(notification.id, { onError: (error) => toast.error(apiErrorMessage(error)) });
    }
    const { href } = describeNotification(notification);
    if (href) {
      onNavigate();
      void navigate(href);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{unread > 0 ? `${unread} chưa đọc` : 'Đã đọc hết'}</p>
        <Button
          variant="ghost"
          size="sm"
          disabled={unread === 0 || markAllRead.isPending}
          onClick={() => markAllRead.mutate(undefined, { onError: (error) => toast.error(apiErrorMessage(error)) })}
        >
          {markAllRead.isPending && <Spinner data-icon="inline-start" />}
          Đánh dấu tất cả đã đọc
        </Button>
      </div>
      <Separator />
      <ul className="flex flex-col gap-1">
        {items.map((notification) => {
          const view = describeNotification(notification);
          const isUnread = notification.readAt === null;
          return (
            <li key={notification.id} className="min-w-0">
              <Button
                variant="ghost"
                className="h-auto w-full min-w-0 flex-col items-start gap-1 py-2 text-left whitespace-normal pointer-coarse:min-h-11"
                onClick={() => open(notification)}
              >
                <span className="flex w-full min-w-0 items-center gap-2">
                  <span className={isUnread ? 'min-w-0 flex-1 font-semibold' : 'min-w-0 flex-1 font-medium'}>
                    {view.title}
                  </span>
                  {isUnread && <Badge>Mới</Badge>}
                </span>
                <span className="w-full font-normal break-words text-muted-foreground">{view.body}</span>
                <time
                  dateTime={notification.createdAt}
                  title={formatDateTime(notification.createdAt)}
                  className="text-xs font-normal text-muted-foreground"
                >
                  {formatRelative(notification.createdAt)}
                </time>
              </Button>
            </li>
          );
        })}
      </ul>
      {notifications.hasNextPage && (
        <Button
          variant="outline"
          disabled={notifications.isFetchingNextPage}
          onClick={() => void notifications.fetchNextPage()}
        >
          {notifications.isFetchingNextPage && <Spinner data-icon="inline-start" />}
          Xem thêm
        </Button>
      )}
    </div>
  );
}
