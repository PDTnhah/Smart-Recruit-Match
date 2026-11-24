import { Inject, Injectable, Logger } from '@nestjs/common';
import type { JdNominationList, JobDescription, SupplementRequest, SupplementRequestBody } from '@srm/shared';
import type { AuthUser } from '../../../common/auth/index.js';
import { Clock } from '../../../common/clock/index.js';
import { errorMessage, SupplementNotAllowedError } from '../../../common/errors/index.js';
import { uniqueViolation } from '../../../db/errors.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { NominationService } from '../../allocation/index.js';
import { AuditService, userActor } from '../../audit/index.js';
import { CampaignService } from '../../campaign/index.js';
import { JdService } from '../../company/index.js';
import { UserDirectory } from '../../iam/index.js';
import { DEDUPE_KEYS, NotificationService, type PendingNotifications } from '../../notification/index.js';
import { JD_ENTITY, REVIEW_AUDIT_ACTIONS, REVIEW_PHASES } from '../domain/audit-actions.js';
import { supplementBlock } from '../domain/supplement.js';
import { ReviewRepository, type SupplementRequestRecord } from '../infrastructure/review.repository.js';

/**
 * "Yêu cầu bổ sung hồ sơ" (GĐ8 step 3, FR-29, US-5.3 AC-9, PRD Q5): HR of a JD that has invited
 * fewer students than its quota asks the center for more candidates, once per published round.
 * Only stored and announced here; US-5.5 decides what a request changes in the next round.
 */
@Injectable()
export class SupplementRequestService {
  private readonly logger = new Logger(SupplementRequestService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly clock: Clock,
    private readonly repository: ReviewRepository,
    private readonly nominations: NominationService,
    private readonly campaigns: CampaignService,
    private readonly jds: JdService,
    private readonly users: UserDirectory,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  /** What the HR page shows next to the button: whether HR may ask now, and when HR asked. */
  async statusOf(jd: JobDescription, invitedCount: number): Promise<JdNominationList['supplement']> {
    const campaign = await this.campaigns.getSettings(jd.campaignId);
    const round = await this.nominations.latestPublishedRound(jd.campaignId);
    const existing = round ? await this.repository.findSupplement(round.id, jd.id) : undefined;
    return {
      blockedBy: supplementBlock({
        phaseOpen: this.campaigns.isPhaseOpen(campaign, REVIEW_PHASES),
        hasPublishedRound: round !== undefined,
        alreadyRequested: existing !== undefined,
        invitedCount,
        quota: jd.quota,
      }),
      requestedAt: existing?.createdAt.toISOString() ?? null,
    };
  }

  /**
   * AC-9: HR's own JD only (404 otherwise, BR-11); 409 when the campaign is not in review, no round
   * is published, invited ≥ quota, or HR already asked in the round. In one transaction: the
   * request, its audit and the center's in-app notice; the notice reaches SSE after commit.
   */
  async request(user: AuthUser, jdId: number, body: SupplementRequestBody): Promise<SupplementRequest> {
    const jd = await this.jds.get(user, jdId);
    const { row, invitedCount, pending } = await this.db.transaction(async (tx) => {
      const campaign = await this.campaigns.assertPhase(jd.campaignId, REVIEW_PHASES, { tx });
      const round = await this.nominations.latestPublishedRound(campaign.id, { tx });
      const invited = await this.nominations.countInvited(jdId, { tx });
      const facts = { invitedCount: invited, quota: jd.quota };
      const blocked = supplementBlock({ phaseOpen: true, hasPublishedRound: round !== undefined, alreadyRequested: false, ...facts });
      if (blocked || !round) throw new SupplementNotAllowedError(jdId, blocked ?? 'NO_PUBLISHED_ROUND', facts);
      let inserted: SupplementRequestRecord;
      try {
        inserted = await this.repository.insertSupplement(tx, {
          campaignId: campaign.id,
          jdId,
          roundId: round.id,
          requestedBy: user.userId,
          note: body.note,
          createdAt: this.clock.now(),
        });
      } catch (error) {
        if (uniqueViolation(error) === 'supplement_requests_round_jd_key') {
          throw new SupplementNotAllowedError(jdId, 'ALREADY_REQUESTED', facts);
        }
        throw error;
      }
      await this.audit.record(tx, {
        actor: userActor(user),
        action: REVIEW_AUDIT_ACTIONS.SUPPLEMENT_REQUESTED,
        entity: JD_ENTITY,
        entityId: jdId,
        after: { requestId: inserted.id, roundId: round.id, ...facts },
      });
      const centerIds = await this.users.centerUserIds();
      const notice: PendingNotifications | null =
        centerIds.length === 0
          ? null
          : await this.notifications.notify(
              {
                type: 'SUPPLEMENT_REQUESTED',
                payload: {
                  campaignId: campaign.id,
                  campaignName: campaign.name,
                  jd: { jdId, title: jd.title, companyName: jd.companyName },
                  ...facts,
                  note: body.note,
                },
                userIds: centerIds,
                channels: ['IN_APP'],
                dedupeKey: DEDUPE_KEYS.supplementRequested(inserted.id),
              },
              { tx },
            );
      return { row: inserted, invitedCount: invited, pending: notice };
    });
    if (pending) {
      try {
        await this.notifications.push(pending);
      } catch (error) {
        // Stored and committed: the bell shows it on the next load (LESSONS §44).
        this.logger.warn(`supplement request ${row.id}: notice not pushed: ${errorMessage(error)}`);
      }
    }
    return {
      id: row.id,
      campaignId: row.campaignId,
      jdId: row.jdId,
      roundId: row.roundId,
      note: row.note,
      invitedCount,
      quota: jd.quota,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** The campaign's supplement requests, oldest first, for the supplementary round (US-5.5). */
  listOfCampaign(campaignId: number): Promise<SupplementRequestRecord[]> {
    return this.repository.supplementsOfCampaign(campaignId);
  }
}
