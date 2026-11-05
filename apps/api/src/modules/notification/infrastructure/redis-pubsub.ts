import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { SERVER_EVENTS } from '@srm/shared';
import type { Redis } from 'ioredis';
import { Observable } from 'rxjs';
import { errorMessage } from '../../../common/errors/index.js';
import { REDIS } from '../../../redis/redis.module.js';

/** One event for the SSE stream (AD-13): its name and a JSON-serializable body. */
export interface RealtimeEvent {
  event: string;
  data: unknown;
}

/** Redis channel of one user's events (CONTEXT D31). */
export const userChannel = (userId: number) => `notify:user:${userId}`;

/**
 * Redis channel of the events every student of a campaign receives (CONTEXT D48): the streams of a
 * student with an active CV in the campaign subscribe to it. No other role does.
 */
export const campaignStudentsChannel = (campaignId: number) => `notify:campaign:${campaignId}:students`;

/**
 * Publishes events to SSE streams on every API instance (AD-13: Redis pub/sub): one user's, or
 * those of the students of a campaign (US-3.4 competition level). Publish only after the change
 * the event announces has committed.
 */
@Injectable()
export class RealtimePublisher {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async publishToUser(userId: number, event: RealtimeEvent): Promise<void> {
    await this.redis.publish(userChannel(userId), JSON.stringify(event));
  }

  /** One message for all students of the campaign, whatever their number (CONTEXT D48). */
  async publishToCampaignStudents(campaignId: number, event: RealtimeEvent): Promise<void> {
    await this.redis.publish(campaignStudentsChannel(campaignId), JSON.stringify(event));
  }
}

type Listener = (event: RealtimeEvent) => void;

interface ChannelState {
  listeners: Set<Listener>;
  /** Resolves once Redis confirmed the subscription; events published before that are not seen. */
  subscribed: Promise<unknown>;
}

/**
 * Delivers the events of a set of channels to the streams open on this instance. A connection in
 * subscriber mode cannot run other commands, so it is a duplicate of the shared client, opened on
 * first use. Each channel is subscribed while at least one stream listening to it is open.
 */
@Injectable()
export class RealtimeSubscriber implements OnApplicationShutdown {
  private readonly logger = new Logger(RealtimeSubscriber.name);
  private connection: Redis | undefined;
  private readonly channels = new Map<string, ChannelState>();

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /**
   * The events of the given channels (a user's own, and a student's campaigns). Emits `ready` first,
   * once every subscription is active: a client reloads its lists on `ready`, so nothing created
   * while it was offline is missed (US-1.7 AC-3).
   */
  streamFor(channels: readonly string[]): Observable<RealtimeEvent> {
    return new Observable<RealtimeEvent>((subscriber) => {
      const listener: Listener = (event) => subscriber.next(event);
      const joined = [...new Set(channels)].map((channel) => {
        let state = this.channels.get(channel);
        if (!state) {
          state = { listeners: new Set(), subscribed: this.subscriberConnection().subscribe(channel) };
          this.channels.set(channel, state);
        }
        state.listeners.add(listener);
        return { channel, state };
      });
      Promise.all(joined.map(({ state }) => state.subscribed)).then(
        () => subscriber.next({ event: SERVER_EVENTS.READY, data: {} }),
        (error: unknown) => subscriber.error(error),
      );
      return () => {
        for (const { channel, state } of joined) this.leave(channel, state, listener);
      };
    });
  }

  async onApplicationShutdown(): Promise<void> {
    const connection = this.connection;
    this.connection = undefined;
    this.channels.clear();
    if (!connection) return;
    if (connection.status === 'wait' || connection.status === 'end') {
      connection.disconnect();
      return;
    }
    await connection.quit().catch(() => connection.disconnect());
  }

  private leave(channel: string, state: ChannelState, listener: Listener): void {
    state.listeners.delete(listener);
    if (state.listeners.size > 0 || this.channels.get(channel) !== state) return;
    this.channels.delete(channel);
    this.subscriberConnection()
      .unsubscribe(channel)
      .catch((error: unknown) => this.logger.warn(`unsubscribe ${channel} failed: ${errorMessage(error)}`));
  }

  private subscriberConnection(): Redis {
    if (!this.connection) {
      const connection = this.redis.duplicate();
      connection.on('error', (error: Error) => this.logger.error(error.message));
      connection.on('message', (channel: string, message: string) => this.dispatch(channel, message));
      this.connection = connection;
    }
    return this.connection;
  }

  private dispatch(channel: string, message: string): void {
    const state = this.channels.get(channel);
    if (!state) return;
    let event: RealtimeEvent;
    try {
      event = JSON.parse(message) as RealtimeEvent;
    } catch {
      this.logger.warn(`dropping a malformed message on ${channel}`);
      return;
    }
    for (const listener of state.listeners) listener(event);
  }
}
