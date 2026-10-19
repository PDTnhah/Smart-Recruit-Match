import { MarkAllReadResultSchema, NotificationListSchema } from '@srm/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, expectOk, unwrap } from '@/shared/api/client';

// API hooks of the notification bell (US-1.7 AC-2, AC-7). The SSE provider invalidates
// `notificationKeys.all` when a notification arrives or the stream reconnects.

export const notificationKeys = {
  all: ['notifications'] as const,
};

const PAGE_SIZE = 20;

/** The caller's notifications, newest first, a page at a time; `unreadCount` is on every page. */
export function useNotifications() {
  return useInfiniteQuery({
    queryKey: notificationKeys.all,
    queryFn: async ({ pageParam }) =>
      NotificationListSchema.parse(
        unwrap(
          await api.GET('/api/notifications', {
            params: { query: pageParam === undefined ? { limit: PAGE_SIZE } : { limit: PAGE_SIZE, before: pageParam } },
          }),
        ),
      ),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      expectOk(await api.POST('/api/notifications/{id}/read', { params: { path: { id } } })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => MarkAllReadResultSchema.parse(unwrap(await api.POST('/api/notifications/read-all'))),
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}
