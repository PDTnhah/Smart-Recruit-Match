import { Inject, Injectable, type MessageEvent } from '@nestjs/common';
import { ACCESS_TOKEN_TTL_SECONDS, SERVER_EVENTS } from '@srm/shared';
import { interval, map, merge, type Observable, takeUntil, timer } from 'rxjs';
import { RealtimeSubscriber } from '../infrastructure/redis-pubsub.js';

export interface EventStreamSettings {
  /** A `ping` this often keeps nginx and other proxies from closing an idle stream (AC-3). */
  pingIntervalMs: number;
  /**
   * The stream ends after this long and the client reconnects with a fresh access token, so a
   * revoked session cannot keep listening past one token lifetime (CONTEXT D31).
   */
  maxLifetimeMs: number;
}

export const EVENT_STREAM_SETTINGS = Symbol('EVENT_STREAM_SETTINGS');

export const DEFAULT_EVENT_STREAM_SETTINGS: EventStreamSettings = {
  pingIntervalMs: 25_000,
  maxLifetimeMs: ACCESS_TOKEN_TTL_SECONDS * 1000,
};

/** `GET /api/events/stream` for one user (AD-13): their events, a heartbeat, a bounded lifetime. */
@Injectable()
export class EventStreamService {
  constructor(
    private readonly subscriber: RealtimeSubscriber,
    @Inject(EVENT_STREAM_SETTINGS) private readonly settings: EventStreamSettings,
  ) {}

  open(userId: number): Observable<MessageEvent> {
    const ping = interval(this.settings.pingIntervalMs).pipe(map(() => ({ event: SERVER_EVENTS.PING, data: {} })));
    return merge(this.subscriber.streamFor(userId), ping).pipe(
      map(({ event, data }): MessageEvent => ({ type: event, data: data as object })),
      takeUntil(timer(this.settings.maxLifetimeMs)),
    );
  }
}
