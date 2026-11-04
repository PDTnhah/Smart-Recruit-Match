import { Injectable, type OnModuleInit } from '@nestjs/common';
import { CampaignService } from '../../campaign/index.js';
import { UserDirectory } from '../../iam/index.js';
import {
  DEDUPE_KEYS,
  DeadlineReminderRegistry,
  type DeadlineReminderSource,
  inReminderWindow,
  type ReminderBatch,
} from '../../notification/index.js';
import { PreferencesRepository } from '../infrastructure/preferences.repository.js';
import { ShortlistService } from './shortlist.service.js';

/**
 * "Sắp hết hạn chọn NV" (PRD › Thông báo, US-3.3 AC-18, CONTEXT D31, D47): for each campaign in
 * PREFERENCE_SELECTION whose `preference_end` is within `reminder_hours_before` hours, the students
 * with a non-empty shortlist and no preference yet. Once per deadline (its dedupe key).
 */
@Injectable()
export class PreferenceDeadlineReminderSource implements DeadlineReminderSource, OnModuleInit {
  readonly name = 'preference-selection';

  constructor(
    private readonly registry: DeadlineReminderRegistry,
    private readonly campaigns: CampaignService,
    private readonly shortlists: ShortlistService,
    private readonly preferences: PreferencesRepository,
    private readonly directory: UserDirectory,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async collect(now: Date): Promise<ReminderBatch[]> {
    const batches: ReminderBatch[] = [];
    for (const campaign of await this.campaigns.listSettingsInPhase('PREFERENCE_SELECTION')) {
      const preferenceEnd = campaign.phaseDeadlines.preference_end;
      if (!preferenceEnd) continue;
      const deadline = new Date(preferenceEnd);
      if (!inReminderWindow(deadline, campaign.config.reminder_hours_before, now)) continue;

      const [shortlists, withAny] = await Promise.all([
        this.shortlists.summariesByStudent(campaign),
        this.preferences.studentIdsWithAny(campaign.id),
      ]);
      const studentIds = [...shortlists]
        .filter(([studentId, { jdIds }]) => jdIds.length > 0 && !withAny.has(studentId))
        .map(([studentId]) => studentId);
      const userIds = await this.directory.userIdsForStudents(studentIds);
      if (userIds.length === 0) continue;

      batches.push({
        userIds,
        channels: ['IN_APP', 'EMAIL'],
        dedupeKey: DEDUPE_KEYS.deadline(campaign.id, 'preference_end', deadline),
        content: {
          type: 'DEADLINE_REMINDER',
          payload: {
            campaignId: campaign.id,
            campaignName: campaign.name,
            deadlineKey: 'preference_end',
            deadline: deadline.toISOString(),
          },
        },
      });
    }
    return batches;
  }
}
