import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { type MatchPairRef, type MatchRunOutput, type ScvWeights, scvWeightsOf } from '@srm/shared';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { AI_RESULT_EVENTS, type AiResultEvent } from '../../aigateway/index.js';
import { CampaignService } from '../../campaign/index.js';
import { type ApprovedJd, JdService } from '../../company/index.js';
import { type PairKey, pairKeyOf } from '../domain/match-plan.js';
import { pairScv } from '../domain/pair-scv.js';
import { MatchResultsRepository, type ResultRow } from '../infrastructure/match-results.repository.js';
import { type MatchRunEnd, MatchRunsRepository } from '../infrastructure/match-runs.repository.js';

type MatchJob = AiResultEvent<'MATCH'>['job'];

const keyOf = (pair: MatchPairRef): PairKey => ({
  cvId: pair.cv_id,
  cvVersion: pair.cv_version,
  jdId: pair.jd_id,
  jdVersion: pair.jd_version,
});

/** What scoring an assessment needs from other modules, read once per message. */
interface Scoring {
  weights: ScvWeights;
  /** JDs of the campaign once approved, filled or closed ones too, by id at their current version. */
  jds: ReadonlyMap<number, ApprovedJd>;
}

interface Applied {
  scored: number;
  /** Items of a JD version that is no longer the current one, or of a JD back in review. */
  stale: number;
  /** Items without a waiting row: a duplicate, or a pair a later run no longer finds eligible. */
  skipped: number;
}

/**
 * Results of the Matching Agent (US-3.2 AC-9, AC-10, CONTEXT D46). A MATCH job answers in several
 * messages under one job_id: chunks of assessments, then a last one with the failed pairs. For each
 * assessment the backend fills the waiting row of the pair and computes S_cv itself from the code
 * verdicts and the project score (AD-2); the last message closes the run.
 *
 * Listener convention of aigateway/domain/events.ts: the consumer has checked the message with Zod
 * and awaits this listener, so a database failure is retried once and then dead-lettered. A
 * duplicate changes nothing: a scored pair has no waiting row left, and a closed run stays closed.
 * Messages of one job may be handled side by side (prefetch) or out of order (a requeue): the last
 * one can close the run before an earlier chunk is stored, which is then still applied and counted.
 */
@Injectable()
export class MatchResultsHandler {
  private readonly logger = new Logger(MatchResultsHandler.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly campaigns: CampaignService,
    private readonly jds: JdService,
    private readonly results: MatchResultsRepository,
    private readonly runs: MatchRunsRepository,
  ) {}

  @OnEvent(AI_RESULT_EVENTS.MATCH, { suppressErrors: false })
  async apply(result: AiResultEvent<'MATCH'>): Promise<void> {
    const { job } = result;
    const output = result.result;
    const scoring = output !== null && output.items.length > 0 ? await this.scoringOf(job.campaign_id) : null;

    const applied = await this.db.transaction(async (tx) => {
      const counts: Applied =
        output !== null && scoring !== null
          ? await this.score(tx, job, output, scoring)
          : { scored: 0, stale: 0, skipped: 0 };
      await this.runs.addScored(tx, job.job_id, counts.scored);
      const review = output?.failed_pairs.filter((pair) => pair.needs_review) ?? [];
      await this.results.flagForReview(tx, job.campaign_id, job.rules_version, review.map(keyOf));
      if (output === null || output.final) await this.runs.finishJob(tx, job.job_id, endOf(result));
      return counts;
    });

    if (applied.stale > 0 || applied.skipped > 0) {
      this.logger.warn(
        `job ${job.job_id}: ${applied.stale} assessments of a JD version no longer current and ${applied.skipped} without a waiting pair left unchanged`,
      );
    }
    if (output === null || output.final) {
      this.logger.log(
        `job ${job.job_id}: matching run of campaign ${job.campaign_id} ${result.status}, ${output?.failed_pairs.length ?? job.pairs.length} pairs failed`,
      );
    }
  }

  /**
   * Other modules' data through their services (Invariant 13), read outside the transaction: the
   * weights of now, and each JD at its current version with its requirements.
   */
  private async scoringOf(campaignId: number): Promise<Scoring> {
    const [campaign, jds] = await Promise.all([
      this.campaigns.getSettings(campaignId),
      // A JD filled or closed while the job ran keeps the scores it was assessed for.
      this.jds.listApprovedForMatching(campaignId, { withEnded: true }),
    ]);
    return { weights: scvWeightsOf(campaign.config), jds: new Map(jds.map((jd) => [jd.jdId, jd])) };
  }

  private async score(tx: DbTx, job: MatchJob, output: MatchRunOutput, scoring: Scoring): Promise<Applied> {
    const rows = await this.results.lockForResult(
      tx,
      job.campaign_id,
      job.rules_version,
      output.prompt_version,
      output.items.map(keyOf),
    );
    const scored = new Set<string>();
    const waiting = new Map<string, ResultRow>();
    for (const row of rows) {
      if (row.promptVersion === null) waiting.set(pairKeyOf(row), row);
      else scored.add(pairKeyOf(row));
    }

    const counts: Applied = { scored: 0, stale: 0, skipped: 0 };
    for (const item of output.items) {
      const key = pairKeyOf(keyOf(item));
      const jd = scoring.jds.get(item.jd_id);
      if (!jd || jd.jdVersion !== item.jd_version) {
        counts.stale += 1;
        continue;
      }
      // Already scored: a duplicate delivery, or the same pair twice in the job.
      if (scored.has(key)) continue;
      const row = waiting.get(key);
      if (!row?.criteria) {
        counts.skipped += 1;
        continue;
      }
      const { scvX100, breakdown } = pairScv(
        { criteria: row.criteria, assessment: item.assessment, facts: row.facts },
        jd.requirements,
        scoring.weights,
      );
      await this.results.applyLlmPart(tx, row.id, {
        promptVersion: output.prompt_version,
        model: item.model,
        assessment: { ...item.assessment, evidence_check: item.evidence_check },
        scvX100,
        breakdown,
      });
      scored.add(key);
      counts.scored += 1;
    }
    return counts;
  }
}

/** The run takes the status of the job; a job that failed as a whole names its error. */
function endOf(result: AiResultEvent<'MATCH'>): MatchRunEnd {
  if (result.status === 'FAILED' || result.result === null) {
    return { status: 'FAILED', pairsFailed: result.job.pairs.length, errorCode: result.error?.code ?? 'AI_JOB_FAILED' };
  }
  return { status: result.status, pairsFailed: result.result.failed_pairs.length, errorCode: null };
}
