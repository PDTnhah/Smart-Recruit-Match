import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { type CvAnalysisEvent, SERVER_EVENTS } from '@srm/shared';
import { errorMessage } from '../../../../common/errors/index.js';
import { CampaignService } from '../../../campaign/index.js';
import { UserDirectory } from '../../../iam/index.js';
import { CV_ANALYSIS_SETTLED, type CvAnalysisSettledEvent } from '../../../student/index.js';
import { DEDUPE_KEYS } from '../../domain/dedupe-keys.js';
import { RealtimePublisher } from '../../infrastructure/redis-pubsub.js';
import { NotificationService } from '../notification.service.js';

/**
 * The analysis of a CV settled (US-2.4 AC-1, AC-9, AC-11, CONTEXT D37):
 * - the student is told in the app that the profile awaits confirmation, or in the app and by
 *   email that the CV must be uploaded again (they may have left the page);
 * - center staff are told in the app when the analysis failed or the file hid text;
 * - the student's page refreshes over SSE (`cv.analysis`).
 * Runs after the student module committed; it cannot call this module itself (notification
 * imports student), so a failure here is logged and the stored state stays the truth.
 */
@Injectable()
export class CvAnalysisListener {
  private readonly logger = new Logger(CvAnalysisListener.name);

  constructor(
    private readonly campaigns: CampaignService,
    private readonly directory: UserDirectory,
    private readonly notifications: NotificationService,
    private readonly realtime: RealtimePublisher,
  ) {}

  @OnEvent(CV_ANALYSIS_SETTLED, { async: true })
  async handle(event: CvAnalysisSettledEvent): Promise<void> {
    try {
      await this.announce(event);
    } catch (error) {
      this.logger.error(`CV ${event.cvId}: analysis notices failed: ${errorMessage(error)}`);
    }
  }

  async announce(event: CvAnalysisSettledEvent): Promise<void> {
    const campaign = await this.campaigns.getSettings(event.campaignId);
    const payload = { cvId: event.cvId, campaignId: event.campaignId, campaignName: campaign.name };
    const studentUsers = await this.directory.userIdsForStudents([event.studentId]);
    const ready = event.status === 'PENDING_CONFIRMATION';
    if (studentUsers.length > 0) {
      await this.notifications.notify(
        ready
          ? {
              type: 'CV_PROFILE_READY',
              payload,
              userIds: studentUsers,
              channels: ['IN_APP'],
              dedupeKey: DEDUPE_KEYS.cvAnalysis('ready', event.cvId, event.jobId),
            }
          : {
              type: 'CV_ANALYSIS_FAILED',
              payload,
              userIds: studentUsers,
              channels: ['IN_APP', 'EMAIL'],
              dedupeKey: DEDUPE_KEYS.cvAnalysis('failed', event.cvId, event.jobId),
            },
      );
    }
    if (!ready || event.hiddenTextDetected) {
      const centerUsers = await this.directory.centerUserIds();
      if (centerUsers.length > 0) {
        await this.notifications.notify({
          type: 'CV_NEEDS_ATTENTION',
          payload: { ...payload, reason: ready ? 'HIDDEN_TEXT' : 'ANALYSIS_FAILED' },
          userIds: centerUsers,
          channels: ['IN_APP'],
          dedupeKey: DEDUPE_KEYS.cvAnalysis('attention', event.cvId, event.jobId),
        });
      }
    }
    const data: CvAnalysisEvent = { cvId: event.cvId, status: event.status };
    const pushed = await Promise.allSettled(
      studentUsers.map((userId) => this.realtime.publishToUser(userId, { event: SERVER_EVENTS.CV_ANALYSIS, data })),
    );
    // Stored already: a client that missed the event sees the new state when it reloads.
    if (pushed.some((push) => push.status === 'rejected')) this.logger.warn(`CV ${event.cvId}: analysis event not pushed`);
  }
}
