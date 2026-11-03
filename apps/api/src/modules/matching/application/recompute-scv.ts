import { Inject, Injectable, Logger } from '@nestjs/common';
import { scvWeightsOf } from '@srm/shared';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { CampaignService } from '../../campaign/index.js';
import { JdService } from '../../company/index.js';
import { pairScv } from '../domain/pair-scv.js';
import { MatchResultsRepository } from '../infrastructure/match-results.repository.js';

export interface ScvRecompute {
  /** Scored pairs of the current JD versions, S_cv computed again. */
  recomputed: number;
  /** Scored pairs of a JD version no longer current, or of a JD back in review: left as they are. */
  kept: number;
}

/**
 * US-3.2 AC-11 (AD-2, CONTEXT D46): S_cv of every scored pair of a campaign again, with the
 * campaign's current weights, from what the rows keep: the code verdicts, the project score and the
 * facts. No job and no LLM call. Only the requirements of the current JD versions are stored, so a
 * row of an older version keeps its S_cv. A function for now; no endpoint calls it yet.
 */
@Injectable()
export class RecomputeScvService {
  private readonly logger = new Logger(RecomputeScvService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly campaigns: CampaignService,
    private readonly jds: JdService,
    private readonly results: MatchResultsRepository,
  ) {}

  async recompute(campaignId: number): Promise<ScvRecompute> {
    // Other modules' data through their services (Invariant 13), outside the transaction.
    const [campaign, approved] = await Promise.all([
      this.campaigns.getSettings(campaignId),
      this.jds.listApprovedForMatching(campaignId, { withEnded: true }),
    ]);
    const weights = scvWeightsOf(campaign.config);
    const jds = new Map(approved.map((jd) => [jd.jdId, jd]));

    const report = await this.db.transaction(async (tx) => {
      const counts: ScvRecompute = { recomputed: 0, kept: 0 };
      for (const row of await this.results.lockScored(tx, campaignId)) {
        const jd = jds.get(row.jdId);
        if (!jd || jd.jdVersion !== row.jdVersion) {
          counts.kept += 1;
          continue;
        }
        const { scvX100, breakdown } = pairScv(row, jd.requirements, weights);
        await this.results.updateScv(tx, row.id, scvX100, breakdown);
        counts.recomputed += 1;
      }
      return counts;
    });
    this.logger.log(`campaign ${campaignId}: S_cv recomputed for ${report.recomputed} pairs, ${report.kept} kept`);
    return report;
  }
}
