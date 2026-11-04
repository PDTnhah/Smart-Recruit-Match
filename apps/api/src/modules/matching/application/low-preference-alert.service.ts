import { Injectable, Logger } from '@nestjs/common';
import { errorMessage } from '../../../common/errors/index.js';
import { CampaignService } from '../../campaign/index.js';
import { JdService } from '../../company/index.js';
import { UserDirectory } from '../../iam/index.js';
import { DEDUPE_KEYS, NotificationService } from '../../notification/index.js';
import { isLowPreferenceJd } from '../domain/competition.js';
import { PreferencesRepository } from '../infrastructure/preferences.repository.js';
import type { AutoAssignOutcome } from './auto-assign-preferences.service.js';

/**
 * Measure 4 of PRD › Cơ chế hỗ trợ JD ít hồ sơ (US-3.4 AC-5, CONTEXT D48): once preference
 * selection is over and Q6 has no student left to serve, every active CENTER account hears which
 * JDs have fewer preferences than places, so staff can contact the companies. Counts come from the
 * database, never from the Redis counters. Called after Q6 at the phase change and on every Q6
 * sweep (LESSONS §34); `dedupe_key` makes the repeats quiet.
 */
@Injectable()
export class LowPreferenceAlertService {
  private readonly logger = new Logger(LowPreferenceAlertService.name);

  constructor(
    private readonly campaigns: CampaignService,
    private readonly jds: JdService,
    private readonly repository: PreferencesRepository,
    private readonly directory: UserDirectory,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * The step after a Q6 run, at the phase change or in a sweep; never throws. While Q6 still has
   * students to serve the alert waits, and the log says so: a student Q6 keeps failing on holds it
   * back until someone fixes the cause.
   */
  async afterAutoAssign(campaignId: number, { outstanding }: AutoAssignOutcome): Promise<void> {
    if (outstanding > 0) {
      this.logger.log(`campaign ${campaignId}: alert of JDs with few preferences waits for ${outstanding} students Q6 has not served`);
      return;
    }
    try {
      const jds = await this.run(campaignId);
      if (jds > 0) this.logger.log(`campaign ${campaignId}: center staff told of ${jds} JDs with fewer preferences than places`);
    } catch (error) {
      this.logger.error(`campaign ${campaignId}: alert of JDs with few preferences failed: ${errorMessage(error)}`);
    }
  }

  /** Returns how many JDs the notice lists; 0 when nobody new was told. */
  async run(campaignId: number): Promise<number> {
    const campaign = await this.campaigns.getSettings(campaignId);
    // Preferences are final in TESTING only: before, students still choose; after, allocation has run.
    if (campaign.status !== 'TESTING') return 0;
    const [cards, counts] = await Promise.all([
      this.jds.listShortlistCards(campaignId),
      this.repository.countByJd(campaignId),
    ]);
    const jds = cards
      .map((card) => ({ card, nvCount: counts.get(card.jdId) ?? 0 }))
      .filter(({ card, nvCount }) => isLowPreferenceJd(nvCount, card.quota))
      .map(({ card, nvCount }) => ({
        jdId: card.jdId,
        title: card.title,
        companyName: card.companyName,
        nvCount,
        quota: card.quota,
      }));
    if (jds.length === 0) return 0;
    const userIds = await this.directory.centerUserIds();
    if (userIds.length === 0) return 0;
    const pending = await this.notifications.notify({
      type: 'JD_LOW_PREFERENCES',
      payload: { campaignId, campaignName: campaign.name, jds },
      userIds,
      channels: ['IN_APP', 'EMAIL'],
      dedupeKey: DEDUPE_KEYS.jdLowPreferences(campaignId),
    });
    // Recipients who already had it are skipped by the dedupe key.
    return pending.count > 0 ? jds.length : 0;
  }
}
