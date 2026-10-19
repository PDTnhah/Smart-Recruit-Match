import { NOTIFICATION_CHANNELS, NOTIFICATION_TYPES, type NotificationChannel, type NotificationType } from '@srm/shared';
import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, text, unique } from 'drizzle-orm/pg-core';
import { id, inList, oneOf, ref, timestamptz } from './columns.js';
import { core } from './core.js';
import { users } from './users.js';

/**
 * Delivery state of the email of a notification (outbox, ARCHITECTURE › Tác vụ định kỳ). A
 * technical status, not a business state: it does not go through `transitionTo` (CONTEXT D31).
 * CANCELLED: superseded (a newer HR invitation) or the recipient can no longer be reached.
 */
export const EMAIL_STATUSES = ['PENDING', 'SENT', 'FAILED', 'CANCELLED'] as const;

export type EmailStatus = (typeof EMAIL_STATUSES)[number];

// One row per recipient (FR-8, US-1.7, CONTEXT D31). The row is the in-app notification and, when
// `channels` has EMAIL, also the outbox entry the email worker sends. Owned by the notification
// module; other modules write here only through NotificationService.notify.
export const notifications = core.table(
  'notifications',
  {
    id: id(),
    userId: ref('user_id')
      .notNull()
      .references(() => users.id),
    type: text('type').$type<NotificationType>().notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    channels: text('channels').array().$type<NotificationChannel[]>().notNull(),
    readAt: timestamptz('read_at'),
    /** Same key for the same recipient means the same notice: a second insert is skipped. */
    dedupeKey: text('dedupe_key'),
    emailStatus: text('email_status').$type<EmailStatus>(),
    emailAttempts: integer('email_attempts').notNull().default(0),
    /** When the worker may try (again); spaced out after each failure. */
    emailNextAttemptAt: timestamptz('email_next_attempt_at'),
    emailSentAt: timestamptz('email_sent_at'),
    emailLastError: text('email_last_error'),
    // Set from the API clock (FakeClock in tests), like the deadlines reminders are computed from.
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    oneOf('notifications_type_check', t.type, NOTIFICATION_TYPES),
    oneOf('notifications_email_status_check', t.emailStatus, EMAIL_STATUSES),
    check(
      'notifications_channels_check',
      sql`cardinality(${t.channels}) > 0 and ${t.channels} <@ array[${inList(NOTIFICATION_CHANNELS)}]::text[]`,
    ),
    // An email status exactly when the notification goes out by email.
    check('notifications_email_status_channel_check', sql`('EMAIL' = any(${t.channels})) = (${t.emailStatus} is not null)`),
    check('notifications_email_attempts_check', sql`${t.emailAttempts} >= 0`),
    index('notifications_user_id_read_at_idx').on(t.userId, t.readAt),
    unique('notifications_user_id_dedupe_key_key').on(t.userId, t.dedupeKey),
    // The outbox worker scans only emails still waiting.
    index('notifications_email_outbox_idx')
      .on(t.emailNextAttemptAt)
      .where(sql`${t.emailStatus} = 'PENDING'`),
  ],
);
