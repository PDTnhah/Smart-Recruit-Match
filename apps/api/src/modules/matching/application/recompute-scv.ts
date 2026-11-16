import { isDeepStrictEqual } from 'node:util';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { scvWeightsOf } from '@srm/shared';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { CampaignService, type CampaignSettings } from '../../campaign/index.js';
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
 * row of an older version keeps its S_cv. Runs when the center changes a weight during intake, and
 * again in every matching run before it plans (US-1.10 AC-2, CONTEXT D56). The weights are read
 * in the transaction that writes, `FOR SHARE`: a weight change waits for it, and its own recompute
 * then runs after it, so an older read never has the last word.
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
    return this.db.transaction(async (tx) => this.recomputeIn(tx, await this.campaigns.getSettings(campaignId, { tx })));
  }

  /**
   * The same within the caller's transaction, with the settings it has read under a lock (a matching
   * run: `assertPhase` with `tx`). A pair whose S_cv comes out the same is not written again.
   */
  async recomputeIn(tx: DbTx, campaign: CampaignSettings): Promise<ScvRecompute> {
    // Other modules' data through their services (Invariant 13), outside the transaction.
    const approved = await this.jds.listApprovedForMatching(campaign.id, { withEnded: true });
    const weights = scvWeightsOf(campaign.config);
    const jds = new Map(approved.map((jd) => [jd.jdId, jd]));

    const report: ScvRecompute = { recomputed: 0, kept: 0 };
    for (const row of await this.results.lockScored(tx, campaign.id)) {
      const jd = jds.get(row.jdId);
      if (!jd || jd.jdVersion !== row.jdVersion) {
        report.kept += 1;
        continue;
      }
      const { scvX100, breakdown } = pairScv(row, jd.requirements, weights);
      report.recomputed += 1;
      // Weights unchanged since the pair was scored: most runs, and every run after intake.
      if (Math.round(row.sCv * 100) === scvX100 && isDeepStrictEqual(row.scvBreakdown, breakdown)) continue;
      await this.results.updateScv(tx, row.id, scvX100, breakdown);
    }
    this.logger.log(`campaign ${campaign.id}: S_cv recomputed for ${report.recomputed} pairs, ${report.kept} kept`);
    return report;
  }
}
