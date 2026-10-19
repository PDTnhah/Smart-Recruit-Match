import { z } from 'zod';
import { CAMPAIGN_DEADLINE_KEYS } from './campaign.js';

// Notifications (FR-8, US-1.7, CONTEXT D31). The API validates `type` + `payload` with these
// schemas before writing a row, and the web renders each type from the same shapes, so both sides
// agree on what a notification carries (AGENTS › Invariant 14). Later stories add a type here, a
// renderer in the web and, for email, a template in the notification module.

/** Where a notification is delivered: the in-app list (with SSE) and/or email through the outbox. */
export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL'] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_TYPES = ['CAMPAIGN_OPENED', 'HR_INVITED', 'DEADLINE_REMINDER'] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const id = z.number().int().positive();
const instant = z.iso.datetime({ offset: true });

/** A campaign left DRAFT; its target students may now submit CVs (PRD › Thông báo). */
export const CampaignOpenedPayloadSchema = z.object({
  campaignId: id,
  campaignName: z.string().min(1),
  intakeEnd: instant,
});

/**
 * An HR account was invited (US-1.5). Email only. The invitation token is never stored here: the
 * email worker asks iam for a link to the account's current invitation when it sends, so only the
 * newest invitation is ever emailed and no live token rests in the database (CONTEXT D31).
 */
export const HrInvitedPayloadSchema = z.object({
  companyId: id,
});

/** A campaign deadline is near and the recipient still has something to do before it. */
export const DeadlineReminderPayloadSchema = z.object({
  campaignId: id,
  campaignName: z.string().min(1),
  deadlineKey: z.enum(CAMPAIGN_DEADLINE_KEYS),
  deadline: instant,
});

/** `type` and the `payload` that goes with it. */
export const NotificationContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CAMPAIGN_OPENED'), payload: CampaignOpenedPayloadSchema }),
  z.object({ type: z.literal('HR_INVITED'), payload: HrInvitedPayloadSchema }),
  z.object({ type: z.literal('DEADLINE_REMINDER'), payload: DeadlineReminderPayloadSchema }),
]);

export type NotificationContent = z.output<typeof NotificationContentSchema>;

const distinct = <T>(values: readonly T[]) => new Set(values).size === values.length;

/** Who receives it and how; `dedupeKey` makes a repeated call for the same recipient a no-op. */
export const NotificationDeliverySchema = z.object({
  userIds: z.array(id).min(1).refine(distinct, { error: 'userIds contains duplicates' }),
  channels: z
    .array(z.enum(NOTIFICATION_CHANNELS))
    .min(1)
    .refine(distinct, { error: 'channels contains duplicates' }),
  dedupeKey: z.string().min(1).max(200).optional(),
});

/** Argument of `NotificationService.notify` (in-process, not an HTTP body). */
export const NotifyInputSchema = z.intersection(NotificationContentSchema, NotificationDeliverySchema);

export type NotifyInput = z.input<typeof NotifyInputSchema>;

/** One entry of the caller's in-app list, also the data of the `notification` SSE event. */
export const NotificationSchema = z.intersection(
  NotificationContentSchema,
  z.object({
    id: z.number().int(),
    readAt: instant.nullable(),
    createdAt: instant,
  }),
);

export type Notification = z.output<typeof NotificationSchema>;

/** `GET /api/notifications`: newest first; `before` is the smallest id of the previous page. */
export const NotificationListQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type NotificationListQuery = z.output<typeof NotificationListQuerySchema>;

export const NotificationListSchema = z.object({
  items: z.array(NotificationSchema),
  /** Unread in-app notifications of the caller, across all pages. */
  unreadCount: z.number().int().min(0),
  /** Pass as `before` to read the next page; null on the last page. */
  nextBefore: z.number().int().nullable(),
});

export type NotificationList = z.output<typeof NotificationListSchema>;

/** Body of `POST /api/notifications/read-all`. */
export const MarkAllReadResultSchema = z.object({ updated: z.number().int().min(0) });

export type MarkAllReadResult = z.output<typeof MarkAllReadResultSchema>;

/**
 * Event names on `GET /api/events/stream` (AD-13). `ready` opens every connection, so a client
 * reloads its lists after reconnecting; `ping` keeps proxies from closing an idle stream. EPIC-2
 * and US-3.4 add their names here.
 */
export const SERVER_EVENTS = {
  READY: 'ready',
  PING: 'ping',
  NOTIFICATION: 'notification',
} as const;

export type ServerEventName = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];
