import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { HrInvitedPayloadSchema } from '@srm/shared';
import { DRIZZLE } from '../../../../db/tokens.js';
import type { Database } from '../../../../db/types.js';
import { HR_INVITED, type HrInvitedEvent } from '../../../iam/index.js';
import { NotificationRepository } from '../../infrastructure/notification.repository.js';
import { NotificationService } from '../notification.service.js';

export type InvitationEmailResult = 'queued' | 'stale';

/**
 * Emails the invitation link to an invited HR (US-1.5 → US-1.7 AC-5). Email only: the HR cannot
 * sign in yet, and the link holds the token. Every re-invite makes earlier links stop working
 * (CONTEXT D29), so only the newest link may be sent: an older email still waiting is cancelled,
 * and an event older than the newest one handled (invitations sent close together, listeners
 * running concurrently) is dropped. A per-user lock orders those checks.
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
      this.logger.error(
        `user ${event.userId}: invitation email failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async queueInvitationEmail(event: HrInvitedEvent): Promise<InvitationEmailResult> {
    const pending = await this.db.transaction(async (tx) => {
      await this.repository.lockInvitationEmails(tx, event.userId);
      const latest = HrInvitedPayloadSchema.safeParse(await this.repository.latestPayload(tx, event.userId, 'HR_INVITED'));
      // Each invitation expires a fixed time after it was issued: a later expiry is a newer link.
      if (latest.success && Date.parse(latest.data.expiresAt) > Date.parse(event.expiresAt)) return null;
      await this.notifications.cancelPendingEmails(tx, event.userId, 'HR_INVITED');
      return this.notifications.notify(
        {
          type: 'HR_INVITED',
          payload: { companyId: event.companyId, invitationPath: event.invitationPath, expiresAt: event.expiresAt },
          userIds: [event.userId],
          channels: ['EMAIL'],
        },
        { tx },
      );
    });
    if (!pending) return 'stale';
    await this.notifications.push(pending);
    return 'queued';
  }
}
