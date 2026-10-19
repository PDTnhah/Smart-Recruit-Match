import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { errorMessage } from '../../../../common/errors/index.js';
import { DRIZZLE } from '../../../../db/tokens.js';
import type { Database } from '../../../../db/types.js';
import { HR_INVITED, type HrInvitedEvent } from '../../../iam/index.js';
import { NotificationRepository } from '../../infrastructure/notification.repository.js';
import { NotificationService } from '../notification.service.js';

/**
 * Queues the invitation email of an invited HR (US-1.5 → US-1.7 AC-5). Email only: the HR cannot
 * sign in yet. The row holds no link: when sending, the worker asks iam for a link to the
 * account's current invitation, so only the newest invitation goes out and no live token is
 * stored (CONTEXT D31). A re-invite withdraws an older email still waiting, so the HR gets one.
 */
@Injectable()
export class HrInvitedListener {
  private readonly logger = new Logger(HrInvitedListener.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly repository: NotificationRepository,
    private readonly notifications: NotificationService,
  ) {}

  @OnEvent(HR_INVITED, { async: true })
  async handle(event: HrInvitedEvent): Promise<void> {
    try {
      await this.queueInvitationEmail(event);
    } catch (error) {
      this.logger.error(`user ${event.userId}: invitation email failed: ${errorMessage(error)}`);
    }
  }

  async queueInvitationEmail(event: HrInvitedEvent): Promise<void> {
    const pending = await this.db.transaction(async (tx) => {
      // Listeners of two quick re-invites run concurrently; the lock lets the second see the first.
      await this.repository.lockInvitationEmails(tx, event.userId);
      await this.notifications.cancelPendingEmails(tx, event.userId, 'HR_INVITED');
      return this.notifications.notify(
        { type: 'HR_INVITED', payload: { companyId: event.companyId }, userIds: [event.userId], channels: ['EMAIL'] },
        { tx },
      );
    });
    await this.notifications.push(pending);
  }
}
