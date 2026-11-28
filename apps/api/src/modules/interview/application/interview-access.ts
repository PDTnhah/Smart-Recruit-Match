import { Injectable } from '@nestjs/common';
import { type AuthUser, canAccessRecord } from '../../../common/auth/index.js';
import { EntityNotFoundError } from '../../../common/errors/index.js';
import type { DbTx } from '../../../db/types.js';
import { NominationService, type PublishedNomination } from '../../allocation/index.js';
import { type AllocationJd, JdService } from '../../company/index.js';
import { INTERVIEW_ENTITY, NOMINATION_ENTITY, OFFER_ENTITY } from '../domain/audit-actions.js';
import { type InterviewRecord, InterviewRepository, type OfferRecord } from '../infrastructure/interview.repository.js';

/** A nomination of a published round the caller may act on, with its JD. */
export interface NominationContext {
  nomination: PublishedNomination;
  jd: AllocationJd;
}

/**
 * Record-level access of GĐ9 (AGENTS › Invariant 7, BR-11, US-5.4 AC-10): HR acts on nominations of
 * its own company's JDs, a student on their own, the center reads every one. Anything else answers
 * 404 like a missing record, so ids of other companies or students reveal nothing. Roles are the
 * routes' `@Roles()`; this only checks whose record it is.
 */
@Injectable()
export class InterviewAccessService {
  constructor(
    private readonly nominations: NominationService,
    private readonly jds: JdService,
    private readonly repository: InterviewRepository,
  ) {}

  /** With `lock`, the nomination row is locked in `tx`. */
  async nomination(
    user: AuthUser,
    nominationId: number,
    options: { tx?: DbTx; lock?: 'update'; entity?: string; entityId?: number } = {},
  ): Promise<NominationContext> {
    const context = await this.contextOf(nominationId, options);
    if (!context || !canAccessRecord(user, { companyId: context.jd.companyId, studentId: context.nomination.studentId })) {
      throw new EntityNotFoundError(options.entity ?? NOMINATION_ENTITY, options.entityId ?? nominationId);
    }
    return context;
  }

  /**
   * A nomination and its JD with no caller to check: the sweep, and a step whose caller was checked
   * already in the same request. Undefined for a missing nomination or one of a draft round.
   */
  async contextOf(nominationId: number, options: { tx?: DbTx; lock?: 'update' } = {}): Promise<NominationContext | undefined> {
    const nomination = await this.nominations.findPublished(nominationId, { tx: options.tx, lock: options.lock });
    const [jd] = nomination ? await this.jds.listAllocationJds([nomination.jdId]) : [];
    return nomination && jd ? { nomination, jd } : undefined;
  }

  /** The interview and its nomination; with `lock`, the interview row is locked in `tx`. */
  async interview(
    user: AuthUser,
    interviewId: number,
    options: { tx?: DbTx; lock?: 'update' } = {},
  ): Promise<NominationContext & { interview: InterviewRecord }> {
    const interview = await this.repository.findInterview(interviewId, options);
    if (!interview) throw new EntityNotFoundError(INTERVIEW_ENTITY, interviewId);
    const context = await this.nomination(user, interview.nominationId, {
      tx: options.tx,
      entity: INTERVIEW_ENTITY,
      entityId: interviewId,
    });
    return { ...context, interview };
  }

  /** The offer and its nomination; with `lock`, the offer row is locked in `tx`. */
  async offer(
    user: AuthUser,
    offerId: number,
    options: { tx?: DbTx; lock?: 'update' } = {},
  ): Promise<NominationContext & { offer: OfferRecord }> {
    const offer = await this.repository.findOffer(offerId, options);
    if (!offer) throw new EntityNotFoundError(OFFER_ENTITY, offerId);
    const context = await this.nomination(user, offer.nominationId, { tx: options.tx, entity: OFFER_ENTITY, entityId: offerId });
    return { ...context, offer };
  }
}
