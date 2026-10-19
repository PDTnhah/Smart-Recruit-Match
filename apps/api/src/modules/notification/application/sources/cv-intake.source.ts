import { Injectable, type OnModuleInit } from '@nestjs/common';
import { CampaignService } from '../../../campaign/index.js';
import { UserDirectory } from '../../../iam/index.js';
import { CvService, StudentService } from '../../../student/index.js';
import { DEDUPE_KEYS } from '../../domain/dedupe-keys.js';
import { inReminderWindow } from '../../domain/reminder-window.js';
import { DeadlineReminderRegistry, type DeadlineReminderSource, type ReminderBatch } from '../deadline-reminder.registry.js';

/**
 * "Sắp hết hạn nộp CV" (PRD › Thông báo, US-1.7 AC-6): for each campaign in INTAKE whose
 * `intake_end` is within `reminder_hours_before` hours, the target students who have no active CV
 * in it. Everything is read through exported services (AGENTS › Invariant 13).
 */
@Injectable()
export class CvIntakeReminderSource implements DeadlineReminderSource, OnModuleInit {
  readonly name = 'cv-intake';

  constructor(
    private readonly registry: DeadlineReminderRegistry,
    private readonly campaigns: CampaignService,
    private readonly students: StudentService,
    private readonly cvs: CvService,
    private readonly directory: UserDirectory,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async collect(now: Date): Promise<ReminderBatch[]> {
    const batches: ReminderBatch[] = [];
    for (const campaign of await this.campaigns.listSettingsInPhase('INTAKE')) {
      const intakeEnd = campaign.phaseDeadlines.intake_end;
      if (!intakeEnd) continue;
      const deadline = new Date(intakeEnd);
      if (!inReminderWindow(deadline, campaign.config.reminder_hours_before, now)) continue;

      const [targetStudents, withCv] = await Promise.all([
        this.students.listIdsInTarget(campaign.target),
        this.cvs.studentIdsWithActiveCv(campaign.id),
      ]);
      const submitted = new Set(withCv);
      const userIds = await this.directory.userIdsForStudents(targetStudents.filter((id) => !submitted.has(id)));
      if (userIds.length === 0) continue;

      batches.push({
        userIds,
        channels: ['IN_APP', 'EMAIL'],
        dedupeKey: DEDUPE_KEYS.deadline(campaign.id, 'intake_end', deadline),
        content: {
          type: 'DEADLINE_REMINDER',
          payload: {
            campaignId: campaign.id,
            campaignName: campaign.name,
            deadlineKey: 'intake_end',
            deadline: deadline.toISOString(),
          },
        },
      });
    }
    return batches;
  }
}
