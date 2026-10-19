import { Bell } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNotifications } from './api';
import { NotificationList } from './notification-list';

/** "9+" past nine keeps the badge on the icon. */
function badgeText(unread: number): string {
  return unread > 9 ? '9+' : String(unread);
}

/**
 * Bell with the unread count, in the header of every portal (US-1.7 AC-7). The count follows SSE
 * through EventStreamProvider. Opens a popover on desktop and a bottom sheet on phones
 * (DESIGN.md §5 item 7).
 */
export function NotificationBell() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const notifications = useNotifications();
  const unread = notifications.data?.pages[0]?.unreadCount ?? 0;

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={unread > 0 ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}
    >
      <Bell />
      {unread > 0 && (
        <Badge aria-hidden="true" className="absolute -top-0.5 -right-0.5 min-w-5 px-1 tabular-nums">
          {badgeText(unread)}
        </Badge>
      )}
    </Button>
  );
  const list = <NotificationList onNavigate={() => setOpen(false)} />;

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85svh]">
          <SheetHeader>
            <SheetTitle>Thông báo</SheetTitle>
            <SheetDescription className="sr-only">Thông báo mới nhất của tài khoản</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{list}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] gap-0 p-0">
        <PopoverHeader className="p-4 pb-2">
          <PopoverTitle>Thông báo</PopoverTitle>
        </PopoverHeader>
        <Separator />
        <div className="max-h-[min(32rem,70vh)] overflow-y-auto p-4">{list}</div>
      </PopoverContent>
    </Popover>
  );
}
