import { Inject, Injectable } from '@nestjs/common';
import type { InterviewResultRequest, InterviewResultResponse, NominationStatus } from '@srm/shared';
import type { AuthUser } from '../../../common/auth/index.js';
import { Clock } from '../../../common/clock/index.js';
import { InterviewReservePlacesLeftError, NominationNotInInterviewError, RowVersionConflictError } from '../../../common/errors/index.js';
import { StateTransitionService } from '../../../common/state/index.js';
import { interviewLifecycle } from '../../../db/lifecycles.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { userActor } from '../../audit/index.js';
import { CampaignService } from '../../campaign/index.js';
import type { PendingNotifications } from '../../notification/index.js';
import { INTERVIEW_ENTITY, INTERVIEW_PHASES, INTERVIEW_REASONS } from '../domain/audit-actions.js';
import { freePlaces, interviewOutcome, isFilled, reserveAllowed } from '../domain/slot-policy.js';
import type { InterviewRecord, OfferRecord } from '../infrastructure/interview.repository.js';
import { InterviewAccessService } from './interview-access.js';
import { InterviewNoticeService } from './interview-notices.js';
import { SlotService } from './slot.service.js';
import { offerView, staffInterviewView } from './views.js';

/**
 * HR's interview result (GĐ9 step 2, FR-30, US-5.4 AC-3…AC-5, BR-13, BR-14). The route is
 * `@Roles('HR')`: no code path records a result by itself, and no LLM is asked. One transaction,
 * the JD's slot lock first: the campaign in review, the interview locked at HR's row version, the
 * nomination still INTERVIEW; the interview DONE, the nomination and its preference PASSED, RESERVE
 * or INTERVIEW_FAILED, an offer with PASSED, all audited (AD-8). The response comes from it (LESSONS §44).
 */
@Injectable()
export class InterviewResultService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly clock: Clock,
    private readonly access: InterviewAccessService,
    private readonly slots: SlotService,
    private readonly campaigns: CampaignService,
    private readonly transitions: StateTransitionService,
    private readonly notices: InterviewNoticeService,
  ) {}

  async record(user: AuthUser, interviewId: number, request: InterviewResultRequest): Promise<InterviewResultResponse> {
    const { nomination, jd } = await this.access.interview(user, interviewId); // 404 before any lock
    const actor = userActor(user);
    const { response, pending } = await this.db.transaction(async (tx) => {
      await this.slots.lock(tx, jd.jdId);
      const campaign = await this.campaigns.assertPhase(nomination.campaignId, INTERVIEW_PHASES, { tx });
      const locked = await this.access.interview(user, interviewId, { tx, lock: 'update' });
      if (locked.interview.rowVersion !== request.rowVersion) {
        throw new RowVersionConflictError(INTERVIEW_ENTITY, interviewId, request.rowVersion, locked.interview.rowVersion);
      }
      const current = await this.access.nomination(user, locked.interview.nominationId, { tx, lock: 'update' });
      if (current.nomination.status !== 'INTERVIEW') {
        throw new NominationNotInInterviewError(current.nomination.id, current.nomination.status);
      }

      const facts = await this.slots.facts(tx, jd);
      if (request.result === 'RESERVE' && !reserveAllowed(facts)) {
        throw new InterviewReservePlacesLeftError(interviewId, freePlaces(facts));
      }
      const { outcome, reservedForQuota } = interviewOutcome(request.result, facts);
      const resultAt = this.clock.now();
      const stored = reservedForQuota ? 'RESERVE' : request.result;
      const note = request.note ?? null;
      const { rowVersion } = await this.transitions.transitionTo({
        lifecycle: interviewLifecycle,
        id: interviewId,
        to: 'DONE',
        actor,
        reason: INTERVIEW_REASONS.RESULT,
        expectedRowVersion: request.rowVersion,
        // The row keeps what was applied; HR's PASSED shows in the nomination's audit reason (BR-14).
        set: { result: stored, resultNote: note, resultAt, resultBy: user.userId },
        tx,
      });
      const interview: InterviewRecord = { ...locked.interview, status: 'DONE', result: stored, resultNote: note, resultAt, rowVersion };
      const nominationRowVersion = await this.slots.move(
        tx,
        current.nomination,
        outcome,
        actor,
        reservedForQuota ? INTERVIEW_REASONS.RESERVED_FOR_QUOTA : INTERVIEW_REASONS.RESULT,
      );

      let status: NominationStatus = outcome;
      let offer: OfferRecord | null = null;
      const notices: PendingNotifications[] = [];
      if (outcome === 'PASSED') {
        offer = await this.slots.sendOffer(tx, current.nomination.id, campaign.config, actor);
      }
      // AC-9: a JD that accepted its quota frees no place again, so its reserve closes at once.
      if (outcome === 'RESERVE' && isFilled(await this.slots.facts(tx, jd))) {
        const reserve = { ...current.nomination, status: 'RESERVE' as const, rowVersion: nominationRowVersion };
        notices.push(...(await this.slots.closeReserve(tx, reserve, jd, 'JD_FILLED')));
        status = 'CLOSED';
      } else {
        notices.push(...(await this.notices.result(tx, current.nomination, jd, outcome, false, offer)));
      }
      return {
        response: {
          nominationId: current.nomination.id,
          nominationStatus: status,
          reservedForQuota,
          interview: staffInterviewView(interview),
          offer: offer ? offerView(offer) : null,
          slots: await this.slots.facts(tx, jd),
        },
        pending: notices,
      };
    });
    await this.notices.push(pending, `interview ${interviewId}`);
    return response;
  }
}
