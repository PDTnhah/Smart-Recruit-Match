import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CAMPAIGN_OPENED, type CampaignOpenedEvent, CampaignService } from '../../../campaign/index.js';
import { UserDirectory } from '../../../iam/index.js';
import { StudentService } from '../../../student/index.js';
import { DEDUPE_KEYS } from '../../domain/dedupe-keys.js';
import { NotificationService } from '../notification.service.js';

/**
 * "Mở đợt" (PRD › Thông báo, US-1.7 AC-5): every student in the campaign's target who has an
 * active account gets it in the app and by email. Recipients follow the same rule as campaign
 * visibility (`isInTarget`), so whoever is told can also open the campaign.
 */
@Injectable()
export class CampaignOpenedListener {
  private readonly logger = new Logger(CampaignOpenedListener.name);

  constructor(
    private readonly campaigns: CampaignService,
    private readonly students: StudentService,
    private readonly directory: UserDirectory,
    private readonly notifications: NotificationService,
  ) {}

  /** Runs after the opening committed; a failure is logged and never reaches the center's request. */
  @OnEvent(CAMPAIGN_OPENED, { async: true })
  async handle(event: CampaignOpenedEvent): Promise<void> {
    try {
      await this.notifyTargetStudents(event.campaignId);
    } catch (error) {
      this.logger.error(
        `campaign ${event.campaignId}: opening notice failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Returns how many notifications were created; a repeated event creates none (dedupe key). */
  async notifyTargetStudents(campaignId: number): Promise<number> {
    const campaign = await this.campaigns.getSettings(campaignId);
    const intakeEnd = campaign.phaseDeadlines.intake_end;
    // An open campaign always has its deadlines (checkOpenable); nothing sensible to say otherwise.
    if (!intakeEnd) throw new Error('campaign has no intake_end');
    const userIds = await this.directory.userIdsForStudents(await this.students.listIdsInTarget(campaign.target));
    if (userIds.length === 0) return 0;
    const pending = await this.notifications.notify({
      type: 'CAMPAIGN_OPENED',
      payload: { campaignId, campaignName: campaign.name, intakeEnd },
      userIds,
      channels: ['IN_APP', 'EMAIL'],
      dedupeKey: DEDUPE_KEYS.campaignOpened(campaignId),
    });
    return pending.count;
  }
}
