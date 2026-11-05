import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { errorMessage } from '../../../common/errors/index.js';
import { SYSTEM_ACTOR } from '../../audit/index.js';
import { CAMPAIGN_PHASE_CHANGED, type CampaignPhaseChangedEvent } from '../../campaign/index.js';
import { type AutoAssignOutcome, AutoAssignPreferencesService } from './auto-assign-preferences.service.js';
import { LowPreferenceAlertService } from './low-preference-alert.service.js';
import { RunMatchingService } from './run-matching.service.js';

/**
 * What matching does at two phase changes, by deadline or by hand. US-3.2 AC-2: when CV intake ends
 * (INTAKE → PREFERENCE_SELECTION) the system runs matching, so students choose with their scores.
 * US-3.3 AC-10: when preference selection ends (PREFERENCE_SELECTION → TESTING) Q6 gives
 * preferences to the students who chose none; once Q6 has nobody left, center staff hear which JDs
 * have fewer preferences than places (US-3.4 AC-5). Other phase changes start nothing.
 */
@Injectable()
export class MatchingPhaseListener {
  private readonly logger = new Logger(MatchingPhaseListener.name);

  constructor(
    private readonly runs: RunMatchingService,
    private readonly autoAssign: AutoAssignPreferencesService,
    private readonly lowPreferenceAlert: LowPreferenceAlertService,
  ) {}

  // `async: true`: a slow or failing step never affects the phase change (campaign/domain/events.ts).
  @OnEvent(CAMPAIGN_PHASE_CHANGED, { async: true })
  async handle(event: CampaignPhaseChangedEvent): Promise<void> {
    if (event.from === 'INTAKE' && event.to === 'PREFERENCE_SELECTION') await this.startMatching(event.campaignId);
    if (event.from === 'PREFERENCE_SELECTION' && event.to === 'TESTING') await this.assignPreferences(event.campaignId);
  }

  private async startMatching(campaignId: number): Promise<void> {
    try {
      const run = await this.runs.start(campaignId, SYSTEM_ACTOR);
      this.logger.log(`campaign ${campaignId}: matching run ${run.runId} started at the end of intake`);
    } catch (error) {
      this.logger.error(`campaign ${campaignId}: matching run at the end of intake failed: ${errorMessage(error)}`);
    }
  }

  private async assignPreferences(campaignId: number): Promise<void> {
    let outcome: AutoAssignOutcome;
    try {
      outcome = await this.autoAssign.run(campaignId);
      this.logger.log(`campaign ${campaignId}: preferences given to ${outcome.assigned.length} students at the deadline (Q6)`);
    } catch (error) {
      // The Q6 sweep runs it again, then the alert.
      this.logger.error(`campaign ${campaignId}: preferences at the deadline (Q6) failed: ${errorMessage(error)}`);
      return;
    }
    await this.lowPreferenceAlert.afterAutoAssign(campaignId, outcome);
  }
}
