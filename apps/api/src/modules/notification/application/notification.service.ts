import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type MarkAllReadResult,
  type Notification,
  type NotificationList,
  type NotificationListQuery,
  type NotificationType,
  type NotifyInput,
  NotifyInputSchema,
  SERVER_EVENTS,
} from '@srm/shared';
import { z } from 'zod';
import type { AuthUser } from '../../../common/auth/index.js';
import { Clock } from '../../../common/clock/index.js';
import { EntityNotFoundError } from '../../../common/errors/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import {
  type NotificationInsert,
  type NotificationRecord,
  NotificationRepository,
} from '../infrastructure/notification.repository.js';
import { RealtimePublisher } from '../infrastructure/redis-pubsub.js';

const ENTITY = 'notification';

/**
 * Rows written by `notify` inside a caller's transaction, waiting to be pushed over SSE. Pass it
 * to `NotificationService.push` after that transaction commits; pushing twice is a no-op.
 */
export class PendingNotifications {
  private pushed = false;

  constructor(readonly created: readonly NotificationRecord[]) {}

  /** New rows; a recipient who already had the same `dedupeKey` is not counted. */
  get count(): number {
    return this.created.length;
  }

  /** @internal Returns false when the rows were already pushed. */
  claimPush(): boolean {
    if (this.pushed) return false;
    this.pushed = true;
    return true;
  }
}

/**
 * Notifications (FR-8, US-1.7, CONTEXT D31). Other modules call `notify` or publish an event the
 * notification listeners handle; this service stores the rows, the email worker sends the email
 * channel, and SSE pushes the in-app channel. No LLM anywhere here (AGENTS › Invariant 2).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly repository: NotificationRepository,
    private readonly realtime: RealtimePublisher,
    private readonly clock: Clock,
  ) {}

  /**
   * AC-1: one row per recipient. `type` and `payload` are checked against the shared schema first;
   * a mismatch throws and writes nothing. With `tx`, the rows belong to the caller's transaction
   * (a rollback removes them) and the caller pushes them after commit; without, this opens its
   * own transaction and pushes after it commits.
   */
  async notify(input: NotifyInput, options: { tx?: DbTx } = {}): Promise<PendingNotifications> {
    const rows = this.toRows(input);
    if (options.tx) return new PendingNotifications(await this.repository.insertMany(options.tx, rows));
    const pending = new PendingNotifications(await this.db.transaction((tx) => this.repository.insertMany(tx, rows)));
    await this.push(pending);
    return pending;
  }

  /**
   * Sends the in-app rows to the recipients' open streams (AC-3). Call only after the transaction
   * that wrote them committed. A Redis failure is logged, not thrown: the rows are stored and the
   * client sees them when it reloads its list.
   */
  async push(pending: PendingNotifications): Promise<void> {
    if (!pending.claimPush()) return;
    const inApp = pending.created.filter((row) => row.channels.includes('IN_APP'));
    const results = await Promise.allSettled(
      inApp.map((row) =>
        this.realtime.publishToUser(row.userId, { event: SERVER_EVENTS.NOTIFICATION, data: toNotification(row) }),
      ),
    );
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed > 0) this.logger.warn(`${failed} of ${inApp.length} notifications were not pushed over SSE`);
  }

  /** Withdraws emails of `type` still waiting for the user, in the caller's transaction. */
  cancelPendingEmails(tx: DbTx, userId: number, type: NotificationType): Promise<number> {
    return this.repository.cancelPendingEmails(tx, userId, type, 'superseded by a newer notification');
  }

  /** AC-2: the caller's in-app notifications, newest first, and how many are unread. */
  async list(user: AuthUser, query: NotificationListQuery): Promise<NotificationList> {
    const [rows, unreadCount] = await Promise.all([
      this.repository.listInApp(user.userId, query.before, query.limit + 1),
      this.repository.countUnread(user.userId),
    ]);
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return {
      items: items.map(toNotification),
      unreadCount,
      nextBefore: rows.length > query.limit && last ? last.id : null,
    };
  }

  /** AC-2: someone else's notification answers 404, like a missing one (BR-11 style). */
  async markRead(user: AuthUser, id: number): Promise<void> {
    if (!(await this.repository.markRead(user.userId, id, this.clock.now()))) throw new EntityNotFoundError(ENTITY, id);
  }

  async markAllRead(user: AuthUser): Promise<MarkAllReadResult> {
    return { updated: await this.repository.markAllRead(user.userId, this.clock.now()) };
  }

  private toRows(input: NotifyInput): NotificationInsert[] {
    const parsed = NotifyInputSchema.safeParse(input);
    if (!parsed.success) {
      // A caller bug, not a user error: it surfaces as 500 and in the log.
      throw new Error(`invalid notification: ${z.prettifyError(parsed.error)}`);
    }
    const { type, payload, userIds, channels, dedupeKey } = parsed.data;
    const now = this.clock.now();
    const byEmail = channels.includes('EMAIL');
    return userIds.map((userId) => ({
      userId,
      type,
      payload,
      channels,
      dedupeKey: dedupeKey ?? null,
      emailStatus: byEmail ? 'PENDING' : null,
      emailNextAttemptAt: byEmail ? now : null,
      createdAt: now,
    }));
  }
}

/** The payload was validated against the shared schema when the row was written. */
export function toNotification(row: NotificationRecord): Notification {
  return {
    id: row.id,
    type: row.type,
    payload: row.payload,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  } as Notification;
}
