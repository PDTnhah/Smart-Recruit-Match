import { Inject, Injectable } from '@nestjs/common';
import type { NotificationChannel, NotificationType } from '@srm/shared';
import { and, count, desc, eq, isNull, lt, lte, sql } from 'drizzle-orm';
import { ADVISORY_LOCK_KEYS } from '../../../common/scheduling/advisory-lock.js';
import { type EmailStatus, notifications } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';

export interface NotificationInsert {
  userId: number;
  type: NotificationType;
  payload: Record<string, unknown>;
  channels: NotificationChannel[];
  dedupeKey: string | null;
  emailStatus: EmailStatus | null;
  emailNextAttemptAt: Date | null;
  createdAt: Date;
}

export interface NotificationRecord {
  id: number;
  userId: number;
  type: NotificationType;
  payload: Record<string, unknown>;
  channels: NotificationChannel[];
  readAt: Date | null;
  createdAt: Date;
}

/** An email waiting in the outbox, as the worker reads it. */
export interface OutboxEmail {
  id: number;
  userId: number;
  type: NotificationType;
  payload: Record<string, unknown>;
  emailAttempts: number;
}

/** Fields the worker writes after an attempt. */
export interface EmailUpdate {
  emailStatus: EmailStatus;
  emailAttempts?: number;
  emailNextAttemptAt?: Date | null;
  emailSentAt?: Date;
  emailLastError?: string | null;
}

const RECORD_COLUMNS = {
  id: notifications.id,
  userId: notifications.userId,
  type: notifications.type,
  payload: notifications.payload,
  channels: notifications.channels,
  readAt: notifications.readAt,
  createdAt: notifications.createdAt,
};

/** Rows shown in the in-app list; an email-only row (an HR invitation) never is. */
const IN_APP = sql`'IN_APP' = any(${notifications.channels})`;

/** Rows per INSERT statement: a campaign may notify thousands of students at once. */
const INSERT_CHUNK = 500;

/** Drizzle access to `core.notifications`, owned by the notification module (AGENTS › Invariant 13). */
@Injectable()
export class NotificationRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Inserts the rows; one whose `(user_id, dedupe_key)` already exists is skipped. Returns the new rows. */
  async insertMany(tx: DbTx, rows: readonly NotificationInsert[]): Promise<NotificationRecord[]> {
    const created: NotificationRecord[] = [];
    for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
      const inserted = await tx
        .insert(notifications)
        .values(rows.slice(start, start + INSERT_CHUNK))
        .onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] })
        .returning(RECORD_COLUMNS);
      created.push(...inserted);
    }
    return created;
  }

  /** In-app notifications of a user, newest first, with an id below `before` when given. */
  listInApp(userId: number, before: number | undefined, limit: number): Promise<NotificationRecord[]> {
    return this.db
      .select(RECORD_COLUMNS)
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), IN_APP, before === undefined ? undefined : lt(notifications.id, before)),
      )
      .orderBy(desc(notifications.id))
      .limit(limit);
  }

  async countUnread(userId: number): Promise<number> {
    const [row] = await this.db
      .select({ unread: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), IN_APP, isNull(notifications.readAt)));
    return row?.unread ?? 0;
  }

  /** Sets `read_at` once (a second call keeps the first time). False when the user has no such notification. */
  async markRead(userId: number, id: number, now: Date): Promise<boolean> {
    const rows = await this.db
      .update(notifications)
      .set({ readAt: sql`coalesce(${notifications.readAt}, ${now.toISOString()}::timestamptz)` })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId), IN_APP))
      .returning({ id: notifications.id });
    return rows.length > 0;
  }

  /** Marks every unread in-app notification of the user; returns how many changed. */
  async markAllRead(userId: number, now: Date): Promise<number> {
    const rows = await this.db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.userId, userId), IN_APP, isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    return rows.length;
  }

  /** Withdraws emails of `type` still waiting for the user, e.g. an older HR invitation link. */
  async cancelPendingEmails(tx: DbTx, userId: number, type: NotificationType, reason: string): Promise<number> {
    const rows = await tx
      .update(notifications)
      .set({ emailStatus: 'CANCELLED', emailNextAttemptAt: null, emailLastError: reason })
      .where(
        and(eq(notifications.userId, userId), eq(notifications.type, type), eq(notifications.emailStatus, 'PENDING')),
      )
      .returning({ id: notifications.id });
    return rows.length;
  }

  /**
   * Serializes, until the transaction ends, the writers of one user's HR invitation emails, so
   * two invitations sent close together are handled one after the other.
   */
  async lockInvitationEmails(tx: DbTx, userId: number): Promise<void> {
    // Two-key form; `hashtext` maps the bigint id to int4 (a collision only serializes two users).
    await tx.execute(
      sql`select pg_advisory_xact_lock(${ADVISORY_LOCK_KEYS.HR_INVITATION_EMAIL}, hashtext(${String(userId)}))`,
    );
  }

  /**
   * Locks the next email due at `now`. `SKIP LOCKED` lets another instance take a different row
   * instead of waiting, so no email is claimed twice (AC-4). No join: LESSONS §12.
   */
  async claimNextEmail(tx: DbTx, now: Date): Promise<OutboxEmail | undefined> {
    const [row] = await tx
      .select({
        id: notifications.id,
        userId: notifications.userId,
        type: notifications.type,
        payload: notifications.payload,
        emailAttempts: notifications.emailAttempts,
      })
      .from(notifications)
      .where(and(eq(notifications.emailStatus, 'PENDING'), lte(notifications.emailNextAttemptAt, now)))
      .orderBy(notifications.emailNextAttemptAt, notifications.id)
      .limit(1)
      .for('update', { skipLocked: true });
    return row;
  }

  async updateEmail(tx: DbTx, id: number, update: EmailUpdate): Promise<void> {
    await tx.update(notifications).set(update).where(eq(notifications.id, id));
  }
}
