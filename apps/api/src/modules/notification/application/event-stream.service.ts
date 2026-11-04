import { Inject, Injectable, Logger, type MessageEvent } from '@nestjs/common';
import { ACCESS_TOKEN_TTL_SECONDS, SERVER_EVENTS } from '@srm/shared';
import { defer, interval, map, merge, type Observable, switchMap, takeUntil, timer } from 'rxjs';
import type { AuthUser } from '../../../common/auth/index.js';
import { errorMessage } from '../../../common/errors/index.js';
import { CvService } from '../../student/index.js';
import { campaignStudentsChannel, RealtimeSubscriber, userChannel } from '../infrastructure/redis-pubsub.js';

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

/**
 * `GET /api/events/stream` for one user (AD-13): their events, a heartbeat, a bounded lifetime. A
 * student also receives the events of each campaign they have an active CV in (CONTEXT D48).
 */
@Injectable()
export class EventStreamService {
  private readonly logger = new Logger(EventStreamService.name);

  constructor(
    private readonly subscriber: RealtimeSubscriber,
    private readonly cvs: CvService,
    @Inject(EVENT_STREAM_SETTINGS) private readonly settings: EventStreamSettings,
  ) {}

  /**
   * The stream ends when the access token that opened it expires (`tokenExpiresAt`, compared with
   * the real time the token was signed with) and the client reconnects with a fresh one, so a
   * revoked session cannot keep listening past its token (CONTEXT D31).
   */
  open(user: AuthUser, tokenExpiresAt: Date | null): Observable<MessageEvent> {
    const untilExpiry = tokenExpiresAt ? tokenExpiresAt.getTime() - Date.now() : Number.POSITIVE_INFINITY;
    const lifetime = Math.max(0, Math.min(this.settings.maxLifetimeMs, untilExpiry));
    const ping = interval(this.settings.pingIntervalMs).pipe(map(() => ({ event: SERVER_EVENTS.PING, data: {} })));
    const events = defer(() => this.channelsOf(user)).pipe(switchMap((channels) => this.subscriber.streamFor(channels)));
    return merge(events, ping).pipe(
      map(({ event, data }): MessageEvent => ({ type: event, data: data as object })),
      takeUntil(timer(lifetime)),
    );
  }

  /**
   * The user's own channel and, for a student, the channel of each campaign of their active CVs.
   * CVs are submitted in INTAKE only, before preferences are chosen, so the list read here does not
   * go stale while the stream lives (at most one access token, CONTEXT D48). HR, CENTER and ADMIN
   * never join a campaign channel (US-3.4 AC-7).
   */
  private async channelsOf(user: AuthUser): Promise<string[]> {
    const own = userChannel(user.userId);
    if (user.role !== 'STUDENT') return [own];
    try {
      const campaignIds = new Set((await this.cvs.activeCvsOf(user.studentId)).map((cv) => cv.campaignId));
      return [own, ...[...campaignIds].map(campaignStudentsChannel)];
    } catch (error) {
      // Notifications still arrive; competition levels wait for the next connection.
      this.logger.warn(`campaign channels of user ${user.userId} not joined: ${errorMessage(error)}`);
      return [own];
    }
  }
}
