import { Inject, Injectable } from '@nestjs/common';
import type {
  InterviewView,
  RescheduleInterviewRequest,
  RescheduleRequestBody,
  RowVersionBody,
  ScheduleInterviewRequest,
  StaffInterviewView,
} from '@srm/shared';
import type { AuthUser } from '../../../common/auth/index.js';
import { Clock } from '../../../common/clock/index.js';
import {
  InterviewAlreadyScheduledError,
  InterviewRescheduleAlreadyRequestedError,
  InterviewTimeNotFutureError,
  InvalidTransitionError,
  NominationNotInInterviewError,
  RowVersionConflictError,
} from '../../../common/errors/index.js';
import { StateTransitionService } from '../../../common/state/index.js';
import { uniqueViolation } from '../../../db/errors.js';
import { interviewLifecycle } from '../../../db/lifecycles.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { AuditService, userActor } from '../../audit/index.js';
import { CampaignService } from '../../campaign/index.js';
import type { PendingNotifications } from '../../notification/index.js';
import { INTERVIEW_AUDIT_ACTIONS, INTERVIEW_ENTITY, INTERVIEW_PHASES, INTERVIEW_REASONS } from '../domain/audit-actions.js';
import { type InterviewRecord, InterviewRepository } from '../infrastructure/interview.repository.js';
import { InterviewAccessService } from './interview-access.js';
import { InterviewNoticeService } from './interview-notices.js';
import { interviewView, staffInterviewView } from './views.js';

/**
 * Scheduling of GĐ9 step 1 (FR-30, US-5.4 AC-1, AC-2, AC-11): HR schedules one interview per
 * nomination it invited and may move it; the student confirms, or asks once for another time. Each
 * write runs in one transaction with the campaign in review (`FOR SHARE`), the interview's row lock,
 * its row version (409 when stale) and the audit; notices are written in it and pushed after commit.
 */
@Injectable()
export class InterviewScheduleService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly clock: Clock,
    private readonly repository: InterviewRepository,
    private readonly access: InterviewAccessService,
    private readonly campaigns: CampaignService,
    private readonly transitions: StateTransitionService,
    private readonly audit: AuditService,
    private readonly notices: InterviewNoticeService,
  ) {}

  /** AC-1: `POST /api/interviews`. 404 for another company's nomination; 409 not INTERVIEW or already scheduled. */
  async schedule(user: AuthUser, request: ScheduleInterviewRequest): Promise<StaffInterviewView> {
    const { nomination } = await this.access.nomination(user, request.nominationId); // 404 before any lock
    const slot = this.futureSlot(request);
    const { interview, pending } = await this.db.transaction(async (tx) => {
      await this.campaigns.assertPhase(nomination.campaignId, INTERVIEW_PHASES, { tx });
      const locked = await this.access.nomination(user, nomination.id, { tx, lock: 'update' });
      if (locked.nomination.status !== 'INTERVIEW') {
        throw new NominationNotInInterviewError(locked.nomination.id, locked.nomination.status);
      }
      const existing = await this.repository.interviewOfNomination(nomination.id, tx);
      if (existing) throw new InterviewAlreadyScheduledError(nomination.id, existing.id);
      let row: InterviewRecord;
      try {
        row = await this.repository.insertInterview(tx, {
          nominationId: nomination.id,
          ...slot,
          createdBy: user.userId,
          createdAt: this.clock.now(),
        });
      } catch (error) {
        // The unique key is the backstop when two schedules race past the check above.
        if (uniqueViolation(error) === 'interviews_nomination_id_key') throw new InterviewAlreadyScheduledError(nomination.id);
        throw error;
      }
      await this.audit.record(tx, {
        actor: userActor(user),
        action: INTERVIEW_AUDIT_ACTIONS.SCHEDULED,
        entity: INTERVIEW_ENTITY,
        entityId: row.id,
        after: { nominationId: nomination.id, scheduledAt: row.scheduledAt.toISOString(), mode: row.mode, location: row.location },
      });
      const notices = await this.notices.scheduled(tx, 'INTERVIEW_SCHEDULED', row, locked.nomination, locked.jd);
      return { interview: row, pending: notices };
    });
    await this.notices.push(pending, `interview ${interview.id}`);
    return staffInterviewView(interview);
  }

  /**
   * AC-2: `PUT /api/interviews/{id}`: HR sets a new time. A confirmed interview, or one the student
   * asked to move, goes back to SCHEDULED for the student to confirm again; one not answered yet
   * only gets the new time. Both are audited, both bump the row version.
   */
  async reschedule(user: AuthUser, interviewId: number, request: RescheduleInterviewRequest): Promise<StaffInterviewView> {
    const { nomination } = await this.access.interview(user, interviewId);
    const slot = this.futureSlot(request);
    const { interview, pending } = await this.db.transaction(async (tx) => {
      await this.campaigns.assertPhase(nomination.campaignId, INTERVIEW_PHASES, { tx });
      const locked = await this.lockAt(tx, user, interviewId, request.rowVersion);
      const actor = userActor(user);
      if (locked.interview.status === 'DONE') throw new InvalidTransitionError(INTERVIEW_ENTITY, 'DONE', 'SCHEDULED');
      let rowVersion: number;
      if (locked.interview.status === 'SCHEDULED') {
        rowVersion = await this.repository.updateSlot(tx, interviewId, request.rowVersion, slot);
        await this.audit.record(tx, {
          actor,
          action: INTERVIEW_AUDIT_ACTIONS.TIME_CHANGED,
          entity: INTERVIEW_ENTITY,
          entityId: interviewId,
          before: { scheduledAt: locked.interview.scheduledAt.toISOString(), mode: locked.interview.mode, location: locked.interview.location },
          after: { scheduledAt: slot.scheduledAt.toISOString(), mode: slot.mode, location: slot.location },
        });
      } else {
        ({ rowVersion } = await this.transitions.transitionTo({
          lifecycle: interviewLifecycle,
          id: interviewId,
          to: 'SCHEDULED',
          actor,
          reason: INTERVIEW_REASONS.RESCHEDULED,
          expectedRowVersion: request.rowVersion,
          set: { ...slot, confirmedAt: null },
          tx,
        }));
      }
      const row: InterviewRecord = { ...locked.interview, ...slot, status: 'SCHEDULED', confirmedAt: null, rowVersion };
      const notices = await this.notices.scheduled(tx, 'INTERVIEW_RESCHEDULED', row, locked.nomination, locked.jd);
      return { interview: row, pending: notices };
    });
    await this.notices.push(pending, `interview ${interviewId}`);
    return staffInterviewView(interview);
  }

  /** AC-2: `POST /api/interviews/{id}/confirm`: the student's own interview, SCHEDULED → CONFIRMED. */
  async confirm(user: AuthUser, interviewId: number, request: RowVersionBody): Promise<InterviewView> {
    const { nomination } = await this.access.interview(user, interviewId);
    return this.db.transaction(async (tx) => {
      await this.campaigns.assertPhase(nomination.campaignId, INTERVIEW_PHASES, { tx });
      const locked = await this.lockAt(tx, user, interviewId, request.rowVersion);
      const confirmedAt = this.clock.now();
      const { rowVersion } = await this.transitions.transitionTo({
        lifecycle: interviewLifecycle,
        id: interviewId,
        to: 'CONFIRMED',
        actor: userActor(user),
        reason: INTERVIEW_REASONS.CONFIRMED,
        expectedRowVersion: request.rowVersion,
        set: { confirmedAt },
        tx,
      });
      return interviewView({ ...locked.interview, status: 'CONFIRMED', confirmedAt, rowVersion });
    });
  }

  /**
   * AC-2: `POST /api/interviews/{id}/reschedule-request`: once per interview (409 the second time,
   * also after HR moved it); HR of the company hears the reason.
   */
  async requestReschedule(user: AuthUser, interviewId: number, request: RescheduleRequestBody): Promise<InterviewView> {
    const { nomination } = await this.access.interview(user, interviewId);
    const { interview, pending } = await this.db.transaction(async (tx) => {
      await this.campaigns.assertPhase(nomination.campaignId, INTERVIEW_PHASES, { tx });
      const locked = await this.lockAt(tx, user, interviewId, request.rowVersion);
      if (locked.interview.rescheduleRequestedAt) throw new InterviewRescheduleAlreadyRequestedError(interviewId);
      const requestedAt = this.clock.now();
      const { rowVersion } = await this.transitions.transitionTo({
        lifecycle: interviewLifecycle,
        id: interviewId,
        to: 'RESCHEDULE_REQUESTED',
        actor: userActor(user),
        reason: INTERVIEW_REASONS.RESCHEDULE_REQUESTED,
        expectedRowVersion: request.rowVersion,
        set: { rescheduleRequestedAt: requestedAt, rescheduleNote: request.note },
        tx,
      });
      const row: InterviewRecord = {
        ...locked.interview,
        status: 'RESCHEDULE_REQUESTED',
        rescheduleRequestedAt: requestedAt,
        rescheduleNote: request.note,
        rowVersion,
      };
      const notices: PendingNotifications[] = await this.notices.rescheduleRequested(tx, row, locked.nomination, locked.jd);
      return { interview: row, pending: notices };
    });
    await this.notices.push(pending, `interview ${interviewId}`);
    return interviewView(interview);
  }

  /** The caller's interview, locked in `tx`, at the row version the page read (AC-11: 409 when stale). */
  private async lockAt(tx: DbTx, user: AuthUser, interviewId: number, rowVersion: number) {
    const locked = await this.access.interview(user, interviewId, { tx, lock: 'update' });
    if (locked.interview.rowVersion !== rowVersion) {
      throw new RowVersionConflictError(INTERVIEW_ENTITY, interviewId, rowVersion, locked.interview.rowVersion);
    }
    return locked;
  }

  /** An interview is set for later than now by the server's clock. */
  private futureSlot(request: { scheduledAt: string; mode: InterviewRecord['mode']; location: string }) {
    const scheduledAt = new Date(request.scheduledAt);
    if (scheduledAt.getTime() <= this.clock.now().getTime()) throw new InterviewTimeNotFutureError(scheduledAt);
    return { scheduledAt, mode: request.mode, location: request.location };
  }
}
