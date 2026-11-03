import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type CampaignStatus,
  MATCH_RUN_MAX_PAIRS,
  type MatchingRun,
  type MatchPairRef,
  scvWeightsOf,
} from '@srm/shared';
import { randomUUID } from 'node:crypto';
import { Clock } from '../../../common/clock/index.js';
import { AiUnavailableError, errorMessage, MatchingRunTooLargeError } from '../../../common/errors/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { AiGatewayService } from '../../aigateway/index.js';
import type { Actor } from '../../audit/index.js';
import { CampaignService, type CampaignSettings } from '../../campaign/index.js';
import { JdService } from '../../company/index.js';
import { SkillCatalogService } from '../../skills/index.js';
import { CvService, StudentService } from '../../student/index.js';
import { judgePair, type PairJudgement } from '../domain/judge-pair.js';
import { type JudgedPair, type PairAction, planCvPairs } from '../domain/match-plan.js';
import { RULES_VERSION } from '../domain/rules-version.js';
import { buildSkillEvidence } from '../domain/skill-evidence.js';
import { hardFilterFacts } from '../domain/student-facts.js';
import { indexTaxonomy } from '../domain/taxonomy-index.js';
import { type MatchCodeRow, MatchResultsRepository } from '../infrastructure/match-results.repository.js';
import { type MatchRunCounts, type MatchRunRecord, MatchRunsRepository } from '../infrastructure/match-runs.repository.js';

/** Matching runs while CVs come in and while students choose (US-3.2 AC-13, CONTEXT D46). */
export const MATCHING_PHASES: readonly CampaignStatus[] = ['INTAKE', 'PREFERENCE_SELECTION'];

const HOUR_MS = 3_600_000;

/**
 * A run still without its last result after this long is closed. A provider batch ends within 48
 * hours (Gemini; Claude 24) and a job has at most three rounds (ai-service MAX_ROUNDS).
 */
const STALE_AFTER_MS = 7 * 24 * HOUR_MS;

/** A run the API never handed to the broker (it stopped between commit and dispatch). */
const UNDISPATCHED_AFTER_MS = HOUR_MS / 4;

/** Rows written per statement. */
const WRITE_CHUNK = 500;

interface Planned {
  run: MatchRunRecord;
  /** By jd_id, then cv_id (AC-7). */
  pairs: MatchPairRef[];
}

type PlannedPair = JudgedPair & { judgement: PairJudgement };

const COUNTED: Readonly<Record<PairAction, keyof MatchRunCounts | null>> = {
  CACHED: 'pairsCached',
  INELIGIBLE: 'pairsIneligible',
  SKIPPED: 'pairsSkipped',
  SEND: 'pairsSent',
  // Counted in the total only.
  REVIEW: null,
};

/**
 * Matching runs of a campaign (FR-14, GĐ3, US-3.2, CONTEXT D42, D46). Code judges every pair: the
 * hard filter, the skill, language and major verdicts, skill_fit. Only the top M pairs of each CV
 * not yet scored go to the Matching Agent, which scores the projects; the backend computes S_cv
 * when the result comes back (AD-2).
 */
@Injectable()
export class RunMatchingService {
  private readonly logger = new Logger(RunMatchingService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly campaigns: CampaignService,
    private readonly cvs: CvService,
    private readonly students: StudentService,
    private readonly jds: JdService,
    private readonly skills: SkillCatalogService,
    private readonly results: MatchResultsRepository,
    private readonly runs: MatchRunsRepository,
    private readonly aiGateway: AiGatewayService,
    private readonly clock: Clock,
  ) {}

  /**
   * AC-1, AC-2: in one transaction the run (409 while another runs), the code part of every pair,
   * what to send and the id of the job; after commit at most one `ai.match.run`, with IDs and
   * versions only (AD-5). A run with nothing to send is over at once. A job the broker refuses
   * fails the run: 503.
   */
  async start(campaignId: number, actor: Actor): Promise<MatchingRun> {
    const { run, pairs } = await this.db.transaction((tx) => this.plan(tx, campaignId, actor));
    if (run.jobId === null) return view(run);
    try {
      await this.aiGateway.dispatch(
        'MATCH',
        { campaign_id: campaignId, rules_version: run.rulesVersion, prompt_version: run.promptVersion, pairs },
        run.jobId,
      );
    } catch (error) {
      this.logger.error(`campaign ${campaignId}: matching run ${run.id} not dispatched: ${errorMessage(error)}`);
      await this.runs.fail(run.id, 'DISPATCH_FAILED');
      throw new AiUnavailableError('MATCH');
    }
    // The job is on its way, so a failure here is no reason to answer 503. Left unmarked, the run
    // is closed as STALE by the next run after UNDISPATCHED_AFTER_MS.
    await this.runs.markDispatched(run.id).catch((error: unknown) => {
      this.logger.warn(`campaign ${campaignId}: matching run ${run.id} sent, not marked so: ${errorMessage(error)}`);
    });
    return view(run);
  }

  private async plan(tx: DbTx, campaignId: number, actor: Actor): Promise<Planned> {
    // FOR SHARE: the campaign cannot leave the phase before this run is stored.
    const campaign = await this.campaigns.assertPhase(campaignId, MATCHING_PHASES, { tx });
    const now = this.clock.now().getTime();
    await this.runs.closeStale(tx, campaignId, new Date(now - STALE_AFTER_MS), new Date(now - UNDISPATCHED_AFTER_MS));
    const runId = await this.runs.insertRunning(tx, campaignId, actor, RULES_VERSION);
    const pinned = await this.results.pinnedPrompt(tx, campaignId);
    const known = await this.results.knownPairs(tx, campaignId, RULES_VERSION, pinned);

    // Other modules' data through their services (Invariant 13); reads outside the transaction.
    const [cvs, jds, taxonomy] = await Promise.all([
      this.cvs.listConfirmedForMatching(campaignId),
      this.jds.listApprovedForMatching(campaignId),
      this.skills.taxonomy(),
    ]);
    const records = await this.students.matchingFacts(cvs.map((cv) => cv.studentId));
    const index = indexTaxonomy(taxonomy);
    const weights = scvWeightsOf(campaign.config);
    const refDate = intakeEndOf(campaign) ?? new Date(now);

    const counts: MatchRunCounts = { pairsTotal: 0, pairsIneligible: 0, pairsSkipped: 0, pairsCached: 0, pairsSent: 0 };
    const pairs: MatchPairRef[] = [];
    let rows: MatchCodeRow[] = [];
    for (const cv of cvs) {
      const facts = hardFilterFacts(records.get(cv.studentId) ?? { major: null, gpa4: null }, cv.profileMasked, refDate);
      const evidence = buildSkillEvidence(cv.profileMasked, index, refDate);
      const judged = jds.map((jd): PlannedPair => {
        const judgement = judgePair({ facts, evidence }, jd, index, weights);
        return {
          cvId: cv.cvId,
          cvVersion: cv.cvVersion,
          jdId: jd.jdId,
          jdVersion: jd.jdVersion,
          eligible: judgement.eligible,
          skillFitX100: judgement.eligible ? judgement.skillFitX100 : null,
          judgement,
        };
      });
      const plan = planCvPairs({ pairs: judged, topM: campaign.config.match_top_m, ...known });
      for (const { pair, action } of plan) {
        counts.pairsTotal += 1;
        const counted = COUNTED[action];
        if (counted !== null) counts[counted] += 1;
        if (action === 'CACHED') continue;
        const { judgement } = pair;
        rows.push({
          campaignId,
          studentId: cv.studentId,
          cvId: pair.cvId,
          cvVersion: pair.cvVersion,
          jdId: pair.jdId,
          jdVersion: pair.jdVersion,
          rulesVersion: RULES_VERSION,
          facts,
          code: judgement.eligible
            ? { criteria: judgement.criteria, skillFitX100: judgement.skillFitX100 }
            : { ineligibleReasons: judgement.ineligibleReasons },
          skippedByPrefilter: action === 'SKIPPED',
        });
        if (action === 'SEND') {
          pairs.push({ cv_id: pair.cvId, cv_version: pair.cvVersion, jd_id: pair.jdId, jd_version: pair.jdVersion });
        }
      }
      if (rows.length >= WRITE_CHUNK) {
        await this.results.upsertCodePart(tx, rows);
        rows = [];
      }
    }
    // Checked before the commit, so the run is not stored: the job contract would refuse it.
    if (pairs.length > MATCH_RUN_MAX_PAIRS) {
      throw new MatchingRunTooLargeError(campaignId, pairs.length, MATCH_RUN_MAX_PAIRS);
    }
    await this.results.upsertCodePart(tx, rows);
    const jobId = pairs.length > 0 ? randomUUID() : null;
    const run = await this.runs.recordPlan(tx, runId, counts, pinned, jobId);
    pairs.sort((a, b) => a.jd_id - b.jd_id || a.cv_id - b.cv_id);
    this.logger.log(
      `campaign ${campaignId}: matching run ${runId}: ${counts.pairsTotal} pairs, ${counts.pairsSent} to score, prompt ${pinned ?? 'active'}`,
    );
    return { run, pairs };
  }
}

/** "Hiện tại" of the run: the end of CV intake (CONTEXT D44), as the year of study reads it. */
function intakeEndOf(campaign: CampaignSettings): Date | null {
  const value = campaign.phaseDeadlines.intake_end;
  return value ? new Date(value) : null;
}

function view(run: MatchRunRecord): MatchingRun {
  return {
    runId: run.id,
    jobId: run.jobId,
    status: run.status,
    rulesVersion: run.rulesVersion,
    promptVersion: run.promptVersion,
    pairsTotal: run.pairsTotal,
    pairsIneligible: run.pairsIneligible,
    pairsSkipped: run.pairsSkipped,
    pairsCached: run.pairsCached,
    pairsSent: run.pairsSent,
  };
}
