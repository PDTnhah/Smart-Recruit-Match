import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { errorMessage } from '../../../common/errors/index.js';
import { SYSTEM_ACTOR } from '../../audit/index.js';
import { CAMPAIGN_PHASE_CHANGED, type CampaignPhaseChangedEvent } from '../../campaign/index.js';
import { RunMatchingService } from './run-matching.service.js';

/**
 * AC-2: when CV intake ends (INTAKE → PREFERENCE_SELECTION, by deadline or by hand), the system runs
 * matching, so students choose with their scores. Other phase changes start nothing.
 */
@Injectable()
export class MatchingPhaseListener {
  private readonly logger = new Logger(MatchingPhaseListener.name);

  constructor(private readonly runs: RunMatchingService) {}

  // `async: true`: a slow or failing run never affects the phase change (campaign/domain/events.ts).
  @OnEvent(CAMPAIGN_PHASE_CHANGED, { async: true })
  async handle(event: CampaignPhaseChangedEvent): Promise<void> {
    if (event.from !== 'INTAKE' || event.to !== 'PREFERENCE_SELECTION') return;
    try {
      const run = await this.runs.start(event.campaignId, SYSTEM_ACTOR);
      this.logger.log(`campaign ${event.campaignId}: matching run ${run.runId} started at the end of intake`);
    } catch (error) {
      this.logger.error(`campaign ${event.campaignId}: matching run at the end of intake failed: ${errorMessage(error)}`);
    }
  }
}
