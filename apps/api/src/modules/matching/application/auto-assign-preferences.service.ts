import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { errorMessage } from '../../../common/errors/index.js';
import { emitSafely } from '../../../common/events/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { AuditService, SYSTEM_ACTOR } from '../../audit/index.js';
import { CampaignService, type CampaignSettings } from '../../campaign/index.js';
import { UserDirectory } from '../../iam/index.js';
import { DEDUPE_KEYS, NotificationService, type PendingNotifications } from '../../notification/index.js';
import { MATCHING_AUDIT_ACTIONS, PREFERENCE_LIST_ENTITY } from '../domain/audit-actions.js';
import { PREFERENCES_AUTO_ASSIGNED, type PreferencesAutoAssignedEvent } from '../domain/events.js';
import { autoAssignedPreferences, type PreferenceEntry } from '../domain/preference-list.js';
import { PreferencesRepository } from '../infrastructure/preferences.repository.js';
import { preferenceListSnapshot } from './preferences.service.js';
import { ShortlistService } from './shortlist.service.js';

const REASON = 'Q6: no preference chosen by preference_end; the first JDs of the shortlist by S_cv';

/**
 * Q6 (PRD GĐ4, US-3.3 AC-10, CONTEXT D47): when preference selection ends, every student with a
 * non-empty shortlist and no preference gets the first min(N_NV, shortlist size) JDs of it, unless
 * the campaign's policy is NONE. Each student in a transaction of their own, under the lock a save
 * takes, so a run again or alongside a late save never adds a second list. It runs at the phase
 * change and again on every sweep while the campaign is in TESTING (PreferenceAutoAssignScheduler).
 */
@Injectable()
export class AutoAssignPreferencesService {
  private readonly logger = new Logger(AutoAssignPreferencesService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly campaigns: CampaignService,
    private readonly shortlists: ShortlistService,
    private readonly repository: PreferencesRepository,
    private readonly audit: AuditService,
    private readonly directory: UserDirectory,
    private readonly notifications: NotificationService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Returns the students given preferences by this call. One failing student does not stop the
   * others; the next sweep tries them again. While a matching run of the campaign still waits for
   * results, a student with JDs left to score waits too, as their shortlist is not whole yet.
   */
  async run(campaignId: number): Promise<number[]> {
    const campaign = await this.campaigns.getSettings(campaignId);
    if (campaign.config.no_preference_policy !== 'AUTO_ASSIGN_TOP_SCV') return [];
    const [shortlists, withAny, scoring] = await Promise.all([
      this.shortlists.summariesByStudent(campaign),
      this.repository.studentIdsWithAny(campaignId),
      this.shortlists.isScoring(campaignId),
    ]);
    const due = [...shortlists].filter(
      ([studentId, { jdIds, pending }]) => jdIds.length > 0 && !withAny.has(studentId) && !(scoring && pending > 0),
    );
    if (due.length === 0) return [];
    const userIds = await this.directory.userIdsByStudent(due.map(([studentId]) => studentId));

    const studentIds: number[] = [];
    const jdIds = new Set<number>();
    for (const [studentId, shortlist] of due) {
      const items = autoAssignedPreferences({ nNv: campaign.config.n_nv, shortlistJdIds: shortlist.jdIds });
      try {
        if (!(await this.assign(campaign, studentId, items, userIds.get(studentId) ?? []))) continue;
        studentIds.push(studentId);
        for (const item of items) jdIds.add(item.jdId);
      } catch (error) {
        this.logger.error(`campaign ${campaignId}: preferences of student ${studentId} not assigned: ${errorMessage(error)}`);
      }
    }

    if (studentIds.length > 0) {
      emitSafely(this.events, this.logger, PREFERENCES_AUTO_ASSIGNED, {
        campaignId,
        studentIds,
        jdIds: [...jdIds].sort((a, b) => a - b),
      } satisfies PreferencesAutoAssignedEvent);
    }
    return studentIds;
  }

  /** False when the student has a list by the time the lock is held. */
  private async assign(
    campaign: CampaignSettings,
    studentId: number,
    items: PreferenceEntry[],
    userIds: number[],
  ): Promise<boolean> {
    const outcome = await this.db.transaction(async (tx): Promise<{ pending: PendingNotifications | null } | null> => {
      await this.repository.lockStudent(tx, studentId);
      if ((await this.repository.listOf(campaign.id, studentId, tx)).length > 0) return null;
      const saved = await this.repository.replace(tx, campaign.id, studentId, items);
      await this.audit.record(tx, {
        actor: SYSTEM_ACTOR,
        action: MATCHING_AUDIT_ACTIONS.PREFERENCES_AUTO_ASSIGNED,
        entity: PREFERENCE_LIST_ENTITY,
        entityId: studentId,
        before: preferenceListSnapshot(campaign.id, []),
        after: preferenceListSnapshot(campaign.id, saved),
        reason: REASON,
      });
      if (userIds.length === 0) return { pending: null };
      const pending = await this.notifications.notify(
        {
          type: 'PREFERENCES_AUTO_ASSIGNED',
          payload: { campaignId: campaign.id, campaignName: campaign.name, count: saved.length },
          userIds,
          channels: ['IN_APP', 'EMAIL'],
          dedupeKey: DEDUPE_KEYS.preferencesAutoAssigned(campaign.id),
        },
        { tx },
      );
      return { pending };
    });
    if (outcome === null) return false;
    if (outcome.pending) await this.notifications.push(outcome.pending);
    return true;
  }
}
