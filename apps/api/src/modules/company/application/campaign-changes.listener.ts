import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { errorMessage } from '../../../common/errors/index.js';
import {
  CAMPAIGN_CANCELLED,
  CAMPAIGN_UPDATED,
  type CampaignCancelledEvent,
  CampaignService,
  type CampaignUpdatedEvent,
} from '../../campaign/index.js';
import { UserDirectory } from '../../iam/index.js';
import { DEDUPE_KEYS, NotificationService } from '../../notification/index.js';
import { JdRepository } from '../infrastructure/jd.repository.js';

/**
 * HR of the companies with a JD in a campaign hear when its deadlines move or it is cancelled
 * (US-1.10 AC-5, AC-8, CONTEXT D56), in the app and by email. Here rather than in notification,
 * which cannot import this module (this module already imports it); students are told there.
 */
@Injectable()
export class HrCampaignChangesListener {
  private readonly logger = new Logger(HrCampaignChangesListener.name);

  constructor(
    private readonly campaigns: CampaignService,
    private readonly jds: JdRepository,
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
      this.logger.error(`campaign ${event.campaignId}: deadline change notice to HR failed: ${errorMessage(error)}`);
    }
  }

  @OnEvent(CAMPAIGN_CANCELLED, { async: true })
  async handleCancelled(event: CampaignCancelledEvent): Promise<void> {
    try {
      await this.notifyCancelled(event);
    } catch (error) {
      this.logger.error(`campaign ${event.campaignId}: cancellation notice to HR failed: ${errorMessage(error)}`);
    }
  }

  /** Returns how many notifications were created; the same edit again creates none (dedupe key). */
  async notifyDeadlinesChanged(event: CampaignUpdatedEvent): Promise<number> {
    const [campaign, userIds] = await Promise.all([
      this.campaigns.getSettings(event.campaignId),
      this.hrUserIdsOf(event.campaignId),
    ]);
    if (userIds.length === 0) return 0;
    const pending = await this.notifications.notify({
      type: 'CAMPAIGN_DEADLINES_CHANGED',
      payload: {
        campaignId: campaign.id,
        campaignName: campaign.name,
        audience: 'HR',
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
    const [campaign, userIds] = await Promise.all([
      this.campaigns.getSettings(event.campaignId),
      this.hrUserIdsOf(event.campaignId),
    ]);
    if (userIds.length === 0) return 0;
    const pending = await this.notifications.notify({
      type: 'CAMPAIGN_CANCELLED',
      payload: { campaignId: campaign.id, campaignName: campaign.name, audience: 'HR', reason: event.reason },
      userIds,
      channels: ['IN_APP', 'EMAIL'],
      dedupeKey: DEDUPE_KEYS.campaignCancelled(campaign.id),
    });
    return pending.count;
  }

  /** HR accounts that can sign in, of every company with a JD in the campaign (BR-11: no other). */
  private async hrUserIdsOf(campaignId: number): Promise<number[]> {
    const companyIds = await this.jds.companyIdsInCampaign(campaignId);
    const perCompany = await Promise.all(companyIds.map((companyId) => this.directory.hrUserIdsOfCompany(companyId)));
    return [...new Set(perCompany.flat())].sort((a, b) => a - b);
  }
}
