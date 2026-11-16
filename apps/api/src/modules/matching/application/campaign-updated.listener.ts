import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SCV_WEIGHT_KEYS } from '@srm/shared';
import { errorMessage } from '../../../common/errors/index.js';
import { CAMPAIGN_UPDATED, type CampaignUpdatedEvent } from '../../campaign/index.js';
import { RecomputeScvService } from './recompute-scv.js';

const WEIGHT_KEYS: ReadonlySet<string> = new Set(SCV_WEIGHT_KEYS);

/**
 * US-1.10 AC-2 (CONTEXT D56): a change of the S_cv weights, allowed during intake only, scores
 * again every pair matching has scored so far, so all students of the campaign are ranked with the
 * same weights. The next matching run does it again, should this fail.
 */
@Injectable()
export class ScvWeightsChangedListener {
  private readonly logger = new Logger(ScvWeightsChangedListener.name);

  constructor(private readonly recomputeScv: RecomputeScvService) {}

  // `async: true`: a slow or failing recompute never affects the edit (campaign/domain/events.ts).
  @OnEvent(CAMPAIGN_UPDATED, { async: true })
  async handle(event: CampaignUpdatedEvent): Promise<void> {
    if (!event.configKeys.some((key) => WEIGHT_KEYS.has(key))) return;
    try {
      await this.recomputeScv.recompute(event.campaignId);
    } catch (error) {
      this.logger.error(`campaign ${event.campaignId}: S_cv recompute after a weight change failed: ${errorMessage(error)}`);
    }
  }
}
