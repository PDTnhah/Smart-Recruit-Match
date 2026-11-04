import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  type PreferenceItem,
  type PreferenceList,
  preferenceRejectionMessage,
  type ReplacePreferencesRequest,
} from '@srm/shared';
import type { AuthUser } from '../../../common/auth/index.js';
import { PreferencesRejectedError } from '../../../common/errors/index.js';
import { emitSafely } from '../../../common/events/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { AuditService, userActor } from '../../audit/index.js';
import { CampaignService } from '../../campaign/index.js';
import { studentIdOf } from '../../student/index.js';
import { MATCHING_AUDIT_ACTIONS, PREFERENCE_LIST_ENTITY } from '../domain/audit-actions.js';
import { PREFERENCES_REPLACED, type PreferencesReplacedEvent } from '../domain/events.js';
import { checkPreferenceList, fullPreferenceCount, type PreferenceRules } from '../domain/preference-list.js';
import { PreferencesRepository } from '../infrastructure/preferences.repository.js';
import { PREFERENCE_PHASES, ShortlistService } from './shortlist.service.js';

/** What the audit keeps of a list: its campaign and the JD of each rank, never scores (NFR-2). */
export function preferenceListSnapshot(campaignId: number, items: readonly PreferenceItem[]): Record<string, unknown> {
  return { campaignId, items: items.map(({ jdId, rank }) => ({ jdId, rank })) };
}

/**
 * Preference lists of GĐ4 (FR-16, BR-04, US-3.3 AC-5–AC-9, AC-13, CONTEXT D47). A save replaces the
 * whole list in one transaction, in the order D47 sets: the student's lock, the phase and its
 * deadline (the campaign row `FOR SHARE`), the rules of the list, the write, the audit.
 */
@Injectable()
export class PreferencesService {
  private readonly logger = new Logger(PreferencesService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly campaigns: CampaignService,
    private readonly shortlists: ShortlistService,
    private readonly repository: PreferencesRepository,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * AC-5: the caller's new list, NV1 first. 404 for a campaign that does not exist; 409 outside
   * PREFERENCE_SELECTION or after `preference_end` by the server clock (AC-9); 422 with the code of
   * the rule the list breaks (AC-6, AC-8). A JD on another student's shortlist only is "not in the
   * shortlist" like any other (AC-3).
   */
  async replace(user: AuthUser, body: ReplacePreferencesRequest): Promise<PreferenceList> {
    const studentId = studentIdOf(user);
    const { campaignId } = body;
    // A save after the deadline is refused before the shortlist is read; the transaction checks again.
    const settings = await this.campaigns.assertPhase(campaignId, PREFERENCE_PHASES);
    // Read before the transaction, as a matching run plans. A result or a JD that changes in
    // between is the same as one changing right after the save: the list keeps the JD, and the
    // page marks it once it is off the shortlist (CONTEXT D47). The lock keeps the list consistent.
    const shortlistJdIds = await this.shortlists.jdIdsFor(studentId, settings);

    const { before, after } = await this.db.transaction(async (tx) => {
      await this.repository.lockStudent(tx, studentId);
      const campaign = await this.campaigns.assertPhase(campaignId, PREFERENCE_PHASES, { tx });
      const rules: PreferenceRules = {
        nNv: campaign.config.n_nv,
        shortlistJdIds,
        requireFull: campaign.config.require_full_preferences,
      };
      const check = checkPreferenceList(body.preferences, rules);
      if (!check.ok) {
        const message = preferenceRejectionMessage(check.code, { nNv: rules.nNv, required: fullPreferenceCount(rules) });
        throw new PreferencesRejectedError(check.code, message, { campaignId, ...(check.jdIds && { jdIds: check.jdIds }) });
      }
      const old = await this.repository.listOf(campaignId, studentId, tx);
      const saved = await this.repository.replace(tx, campaignId, studentId, body.preferences);
      await this.audit.record(tx, {
        actor: userActor(user),
        action: MATCHING_AUDIT_ACTIONS.PREFERENCES_REPLACED,
        entity: PREFERENCE_LIST_ENTITY,
        entityId: studentId,
        before: preferenceListSnapshot(campaignId, old),
        after: preferenceListSnapshot(campaignId, saved),
      });
      return { before: old, after: saved };
    });

    const jdIds = [...new Set([...before, ...after].map((item) => item.jdId))].sort((a, b) => a - b);
    emitSafely(this.events, this.logger, PREFERENCES_REPLACED, {
      campaignId,
      studentId,
      jdIds,
    } satisfies PreferencesReplacedEvent);
    return { campaignId, preferences: after };
  }
}
