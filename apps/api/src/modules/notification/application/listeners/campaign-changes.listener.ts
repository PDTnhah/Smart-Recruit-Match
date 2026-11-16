import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { CampaignTarget } from '@srm/shared';
import { errorMessage } from '../../../../common/errors/index.js';
import {
  CAMPAIGN_CANCELLED,
  CAMPAIGN_UPDATED,
  type CampaignCancelledEvent,
  CampaignService,
  type CampaignUpdatedEvent,
} from '../../../campaign/index.js';
import { UserDirectory } from '../../../iam/index.js';
import { StudentService } from '../../../student/index.js';
import { DEDUPE_KEYS } from '../../domain/dedupe-keys.js';
import { NotificationService } from '../notification.service.js';

/**
 * Students of a campaign's target hear when its deadlines move or it is cancelled (US-1.10 AC-5,
 * AC-8, CONTEXT D56), in the app and by email: the recipients of the opening notice. HR of the
 * companies with a JD in the campaign are told by the company module, which owns the JDs.
 */
@Injectable()
export class CampaignChangesListener {
  private readonly logger = new Logger(CampaignChangesListener.name);

  constructor(
    private readonly campaigns: CampaignService,
    private readonly students: StudentService,
    private readonly directory: UserDirectory,
    private readonly notifications: NotificationService,
  ) {}

  /** Runs after the edit committed; a failure is logged and never reaches the center's request. */
  @OnEvent(CAMPAIGN_UPDATED, { async: true })
  async handleUpdated(event: CampaignUpdatedEvent): Promise<void> {
    if (event.deadlines.length === 0) return;
    try {
      await this.notifyDeadlinesChanged(event);
    } catch (error) {
      this.logger.error(`campaign ${event.campaignId}: deadline change notice failed: ${errorMessage(error)}`);
    }
  }

  @OnEvent(CAMPAIGN_CANCELLED, { async: true })
  async handleCancelled(event: CampaignCancelledEvent): Promise<void> {
    try {
      await this.notifyCancelled(event);
    } catch (error) {
      this.logger.error(`campaign ${event.campaignId}: cancellation notice failed: ${errorMessage(error)}`);
    }
  }

  /**
   * Returns how many notifications were created; the same edit again creates none (dedupe key).
   * Students the same edit added to the target are left out: they hear of the campaign as opened.
   */
  async notifyDeadlinesChanged(event: CampaignUpdatedEvent): Promise<number> {
    const campaign = await this.campaigns.getSettings(event.campaignId);
    const userIds = await this.targetUserIds(event.targetBefore ?? campaign.target);
    if (userIds.length === 0) return 0;
    const pending = await this.notifications.notify({
      type: 'CAMPAIGN_DEADLINES_CHANGED',
      payload: {
        campaignId: campaign.id,
        campaignName: campaign.name,
        audience: 'STUDENT',
        deadlines: event.deadlines,
        reason: event.reason,
      },
      userIds,
      channels: ['IN_APP', 'EMAIL'],
      dedupeKey: DEDUPE_KEYS.campaignDeadlinesChanged(campaign.id, event.rowVersion),
    });
    return pending.count;
  }

  /** Returns how many notifications were created; a repeated event creates none (dedupe key). */
  async notifyCancelled(event: CampaignCancelledEvent): Promise<number> {
    const campaign = await this.campaigns.getSettings(event.campaignId);
    const userIds = await this.targetUserIds(campaign.target);
    if (userIds.length === 0) return 0;
    const pending = await this.notifications.notify({
      type: 'CAMPAIGN_CANCELLED',
      payload: { campaignId: campaign.id, campaignName: campaign.name, audience: 'STUDENT', reason: event.reason },
      userIds,
      channels: ['IN_APP', 'EMAIL'],
      dedupeKey: DEDUPE_KEYS.campaignCancelled(campaign.id),
    });
    return pending.count;
  }

  /** Active accounts of the students in the target, as for the opening notice (`isInTarget`). */
  private async targetUserIds(target: CampaignTarget): Promise<number[]> {
    return this.directory.userIdsForStudents(await this.students.listIdsInTarget(target));
  }
}
