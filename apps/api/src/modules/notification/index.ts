// Public entry of the notification module (CONTEXT D22): other code imports only from here.
export { NotificationModule } from './notification.module.js';
export { NotificationService, PendingNotifications } from './application/notification.service.js';
export {
  DeadlineReminderRegistry,
  type DeadlineReminderSource,
  type ReminderBatch,
} from './application/deadline-reminder.registry.js';
export { RealtimePublisher, type RealtimeEvent } from './infrastructure/redis-pubsub.js';
// For reminder sources and notices of other modules (US-3.3): the same keys and window everywhere.
export { DEDUPE_KEYS } from './domain/dedupe-keys.js';
export { inReminderWindow } from './domain/reminder-window.js';
