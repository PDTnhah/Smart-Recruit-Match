import { SERVER_EVENTS } from '@srm/shared';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { notifySessionExpired } from '@/shared/api/client';
import { notificationKeys } from './api';
import { connectEventStream } from './event-stream';
import { EventStreamContext, type ServerEventListener, type SubscribeToServerEvents } from './server-events';

/**
 * One SSE connection per tab while a portal is shown (US-1.7 AC-3, AC-7). Mounted inside the
 * portal layouts, so signing out unmounts it and closes the stream. A new notification, or a
 * reconnection (`ready` after the first), reloads the notification list: nothing created while
 * the tab was offline is missed. Other screens listen with `useServerEvent`.
 */
export function EventStreamProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const listeners = useRef(new Map<string, Set<ServerEventListener>>());

  useEffect(() => {
    let connectedBefore = false;
    return connectEventStream({
      onEvent: (name, data) => {
        const reconnected = name === SERVER_EVENTS.READY && connectedBefore;
        if (name === SERVER_EVENTS.READY) connectedBefore = true;
        if (reconnected || name === SERVER_EVENTS.NOTIFICATION) {
          void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
        }
        for (const listener of listeners.current.get(name) ?? []) listener(data);
      },
      onSessionExpired: notifySessionExpired,
    });
  }, [queryClient]);

  const subscribe = useCallback<SubscribeToServerEvents>((name, listener) => {
    let set = listeners.current.get(name);
    if (!set) {
      set = new Set();
      listeners.current.set(name, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }, []);

  return <EventStreamContext value={subscribe}>{children}</EventStreamContext>;
}
