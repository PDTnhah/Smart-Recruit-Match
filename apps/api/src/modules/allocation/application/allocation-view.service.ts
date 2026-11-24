import { Injectable } from '@nestjs/common';
import type {
  AllocationExplanation,
  AllocationRoundList,
  AllocationRoundView,
  MyAllocationResult,
  MyAllocationResults,
} from '@srm/shared';
import { EntityNotFoundError } from '../../../common/errors/index.js';
import type { DbTx } from '../../../db/types.js';
import { CampaignService } from '../../campaign/index.js';
import { JdService } from '../../company/index.js';
import { StudentService } from '../../student/index.js';
import { explainOutcome, studentOutcome } from '../domain/index.js';
import { AllocationRoundRepository, ROUND_ENTITY, type RoundRecord } from '../infrastructure/allocation-round.repository.js';
import { buildExplanation, buildRoundView, fromCenti, heldOf, idsOf, type RoundContext, summaryOf } from './round-view.js';

/**
 * What the center and students read of allocation rounds (US-5.2 AC-7, AC-12, AC-13). Only CENTER
 * reaches the drafts and the full explanation; a student reads published rounds that name them,
 * with nothing of other students (PRD › Personas).
 */
@Injectable()
export class AllocationViewService {
  constructor(
    private readonly repository: AllocationRoundRepository,
    private readonly campaigns: CampaignService,
    private readonly students: StudentService,
    private readonly jds: JdService,
  ) {}

  async list(campaignId: number): Promise<AllocationRoundList> {
    await this.campaigns.getSettings(campaignId); // 404 for an unknown campaign
    return { items: (await this.repository.listByCampaign(campaignId)).map(summaryOf) };
  }

  /** With `tx`, the round and its nominations as that transaction sees them (run, adjust, publish). */
  async view(roundId: number, tx?: DbTx): Promise<AllocationRoundView> {
    const round = await this.requireRound(roundId, tx);
    const nominations = await this.repository.nominationsOf(round.id, tx);
    return buildRoundView(round, nominations, await this.contextOf(round));
  }

  /** AC-13: why the student is not at each JD they ranked above their result; 404 when the round never ranked them. */
  async explain(roundId: number, studentId: number): Promise<AllocationExplanation> {
    const round = await this.requireRound(roundId);
    if (!idsOf(round.inputSnapshot).studentIds.includes(studentId)) {
      throw new EntityNotFoundError('allocation_student', studentId);
    }
    const nominations = await this.repository.nominationsOf(round.id);
    return buildExplanation(round, nominations, studentId, await this.contextOf(round));
  }

  /** AC-12: the published rounds of the student's own campaigns, newest first; never another student's. */
  async myResults(studentId: number): Promise<MyAllocationResults> {
    const items: MyAllocationResult[] = [];
    for (const round of await this.repository.listPublishedOfStudent(studentId)) {
      const nominations = await this.repository.nominationsOf(round.id);
      const outcome = studentOutcome(explainOutcome(round.inputSnapshot, heldOf(round.inputSnapshot, nominations), String(studentId)));
      const own = nominations.find((nomination) => nomination.studentId === studentId);
      const jdIds = [...new Set([...outcome.items.map((item) => Number(item.jdId)), ...(own ? [own.jdId] : [])])];
      const jds = new Map((await this.jds.listAllocationJds(jdIds)).map((jd) => [jd.jdId, jd]));
      const campaign = await this.campaigns.getSettings(round.campaignId);
      const ownJd = own ? jds.get(own.jdId) : undefined;
      items.push({
        campaignId: round.campaignId,
        campaignName: campaign.name,
        roundNo: round.roundNo,
        publishedAt: (round.publishedAt ?? round.ranAt).toISOString(),
        nomination: own
          ? { jdId: own.jdId, title: ownJd?.title ?? '', companyName: ownJd?.companyName ?? '', status: own.status }
          : null,
        preferences: outcome.items.map((item) => {
          const jd = jds.get(Number(item.jdId));
          return {
            preferenceRank: item.preferenceRank,
            jdId: Number(item.jdId),
            title: jd?.title ?? '',
            companyName: jd?.companyName ?? '',
            reason: item.reason,
            exclusionReasons: [...item.exclusionReasons],
            sFinal: item.sFinal === null ? null : fromCenti(item.sFinal),
          };
        }),
      });
    }
    return { items };
  }

  private async requireRound(roundId: number, tx?: DbTx): Promise<RoundRecord> {
    const round = await this.repository.findRound(roundId, { tx });
    if (!round) throw new EntityNotFoundError(ROUND_ENTITY, roundId);
    return round;
  }

  private async contextOf(round: RoundRecord): Promise<RoundContext> {
    const { studentIds, jdIds } = idsOf(round.inputSnapshot);
    const [campaign, students, jds] = await Promise.all([
      this.campaigns.getSettings(round.campaignId),
      this.students.allocationRecords(studentIds),
      this.jds.listAllocationJds(jdIds),
    ]);
    return { campaignName: campaign.name, students, jds: new Map(jds.map((jd) => [jd.jdId, jd])) };
  }
}
