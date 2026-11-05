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

export interface AutoAssignOutcome {
  /** Students given preferences by this call. */
  assigned: number[];
  /**
   * Students without a preference Q6 still has to serve: waiting for a matching run that is still
   * scoring their JDs, or whose assignment failed. 0 means Q6 is done for the campaign (US-3.4 AC-5).
   */
  outstanding: number;
}

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
   * Gives preferences to the students due now and says how many are left. One failing student does
   * not stop the others; the next sweep tries them again. While a matching run of the campaign
   * still waits for results, a student with JDs left to score waits too, as their shortlist is not
   * whole yet.
   */
  async run(campaignId: number): Promise<AutoAssignOutcome> {
    const campaign = await this.campaigns.getSettings(campaignId);
    if (campaign.config.no_preference_policy !== 'AUTO_ASSIGN_TOP_SCV') return { assigned: [], outstanding: 0 };
    const [shortlists, withAny, scoring] = await Promise.all([
      this.shortlists.summariesByStudent(campaign),
      this.repository.studentIdsWithAny(campaignId),
      this.shortlists.isScoring(campaignId),
    ]);
    const without = [...shortlists].filter(([studentId]) => !withAny.has(studentId));
    const waiting = without.filter(([, { pending }]) => scoring && pending > 0).length;
    const due = without.filter(([, { jdIds, pending }]) => jdIds.length > 0 && !(scoring && pending > 0));
    if (due.length === 0) return { assigned: [], outstanding: waiting };
    const userIds = await this.directory.userIdsByStudent(due.map(([studentId]) => studentId));

    const studentIds: number[] = [];
    const jdIds = new Set<number>();
    let failed = 0;
    for (const [studentId, shortlist] of due) {
      const items = autoAssignedPreferences({ nNv: campaign.config.n_nv, shortlistJdIds: shortlist.jdIds });
      try {
        if (!(await this.assign(campaign, studentId, items, userIds.get(studentId) ?? []))) continue;
        studentIds.push(studentId);
        for (const item of items) jdIds.add(item.jdId);
      } catch (error) {
        failed += 1;
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
    return { assigned: studentIds, outstanding: waiting + failed };
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
