import { Inject, Injectable, type MessageEvent } from '@nestjs/common';
import { ACCESS_TOKEN_TTL_SECONDS, SERVER_EVENTS } from '@srm/shared';
import { interval, map, merge, type Observable, takeUntil, timer } from 'rxjs';
import { RealtimeSubscriber } from '../infrastructure/redis-pubsub.js';

export interface EventStreamSettings {
  /** A `ping` this often keeps nginx and other proxies from closing an idle stream (AC-3). */
  pingIntervalMs: number;
  /** Upper bound on a stream's life, for tokens without `exp`. */
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

  /**
   * The stream ends when the access token that opened it expires (`tokenExpiresAt`, compared with
   * the real time the token was signed with) and the client reconnects with a fresh one, so a
   * revoked session cannot keep listening past its token (CONTEXT D31).
   */
  open(userId: number, tokenExpiresAt: Date | null): Observable<MessageEvent> {
    const untilExpiry = tokenExpiresAt ? tokenExpiresAt.getTime() - Date.now() : Number.POSITIVE_INFINITY;
    const lifetime = Math.max(0, Math.min(this.settings.maxLifetimeMs, untilExpiry));
    const ping = interval(this.settings.pingIntervalMs).pipe(map(() => ({ event: SERVER_EVENTS.PING, data: {} })));
    return merge(this.subscriber.streamFor(userId), ping).pipe(
      map(({ event, data }): MessageEvent => ({ type: event, data: data as object })),
      takeUntil(timer(lifetime)),
    );
  }
}
