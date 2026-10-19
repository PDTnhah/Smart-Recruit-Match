import type { ServerEventName } from '@srm/shared';
import { createContext, useContext, useEffect, useRef } from 'react';

export type ServerEventListener = (data: unknown) => void;
export type SubscribeToServerEvents = (name: ServerEventName, listener: ServerEventListener) => () => void;

/** Provided by EventStreamProvider, which owns the tab's SSE connection. */
export const EventStreamContext = createContext<SubscribeToServerEvents | null>(null);

/**
 * Calls `handler` with the data of every `name` event on the caller's stream (US-1.7). EPIC-2
 * listens for AI job progress and US-3.4 for competition levels this way.
 */
export function useServerEvent(name: ServerEventName, handler: ServerEventListener): void {
  const subscribe = useContext(EventStreamContext);
  if (!subscribe) throw new Error('useServerEvent must be used inside EventStreamProvider');
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => subscribe(name, (data) => latest.current(data)), [subscribe, name]);
}
