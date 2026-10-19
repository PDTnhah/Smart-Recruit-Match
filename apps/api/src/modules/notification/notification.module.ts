import { Module } from '@nestjs/common';
import { loadEnv } from '../../common/config/env.js';
import { CampaignModule } from '../campaign/index.js';
import { IamModule } from '../iam/index.js';
import { StudentModule } from '../student/index.js';
import { EventsController } from './api/events.controller.js';
import { NotificationController } from './api/notification.controller.js';
import { DeadlineReminderRegistry } from './application/deadline-reminder.registry.js';
import { DeadlineReminderScheduler } from './application/deadline-reminder.scheduler.js';
import { EmailOutboxWorker } from './application/email-outbox.worker.js';
import { EmailRenderer } from './application/email-renderer.js';
import {
  DEFAULT_EVENT_STREAM_SETTINGS,
  EVENT_STREAM_SETTINGS,
  EventStreamService,
} from './application/event-stream.service.js';
import { CampaignOpenedListener } from './application/listeners/campaign-opened.listener.js';
import { HrInvitedListener } from './application/listeners/hr-invited.listener.js';
import { NotificationService } from './application/notification.service.js';
import { CvIntakeReminderSource } from './application/sources/cv-intake.source.js';
import { MAIL_TRANSPORT, SmtpMailTransport } from './infrastructure/mailer.js';
import { NotificationRepository } from './infrastructure/notification.repository.js';
import { RealtimePublisher, RealtimeSubscriber } from './infrastructure/redis-pubsub.js';

/**
 * In-app notifications, SSE, email outbox and deadline reminders (FR-8, US-1.7, CONTEXT D31).
 * Reads recipients only through exported services of campaign, student and iam (Invariant 13).
 * Relies on the global DbModule, RedisModule, ClockModule, ScheduleModule and EventEmitterModule.
 * No module imports this one back except those that call `notify` or register a reminder source.
 */
@Module({
  imports: [CampaignModule, StudentModule, IamModule],
  controllers: [NotificationController, EventsController],
  providers: [
    NotificationService,
    NotificationRepository,
    RealtimePublisher,
    RealtimeSubscriber,
    EventStreamService,
    { provide: EVENT_STREAM_SETTINGS, useValue: DEFAULT_EVENT_STREAM_SETTINGS },
    EmailRenderer,
    EmailOutboxWorker,
    { provide: MAIL_TRANSPORT, useFactory: () => new SmtpMailTransport(loadEnv()) },
    DeadlineReminderRegistry,
    DeadlineReminderScheduler,
    CvIntakeReminderSource,
    CampaignOpenedListener,
    HrInvitedListener,
  ],
  exports: [NotificationService, RealtimePublisher, DeadlineReminderRegistry],
})
export class NotificationModule {}
