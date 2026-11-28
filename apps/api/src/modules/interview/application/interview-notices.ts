import { Injectable, Logger } from '@nestjs/common';
import type { NotificationType, OfferResponse } from '@srm/shared';
import { errorMessage } from '../../../common/errors/index.js';
import type { DbTx } from '../../../db/types.js';
import type { PublishedNomination } from '../../allocation/index.js';
import type { AllocationJd } from '../../company/index.js';
import { UserDirectory } from '../../iam/index.js';
import { DEDUPE_KEYS, NotificationService, type PendingNotifications } from '../../notification/index.js';
import { StudentService } from '../../student/index.js';
import type { InterviewRecord, OfferRecord } from '../infrastructure/interview.repository.js';
import type { InterviewOutcome } from '../domain/slot-policy.js';

type Student = { studentCode: string; fullName: string };

const jdOf = (jd: AllocationJd) => ({ jdId: jd.jdId, title: jd.title, companyName: jd.companyName });

/**
 * The notices of GĐ9 (PRD › Thông báo, US-5.4, CONTEXT D66), all in the app only: written in the
 * caller's transaction, pushed over SSE once it has committed (`push`). Recipients come from
 * UserDirectory; a student or a company without an active account gets nothing.
 */
@Injectable()
export class InterviewNoticeService {
  private readonly logger = new Logger(InterviewNoticeService.name);

  constructor(
    private readonly users: UserDirectory,
    private readonly students: StudentService,
    private readonly notifications: NotificationService,
  ) {}

  async studentOf(studentId: number): Promise<Student> {
    const record = (await this.students.allocationRecords([studentId])).get(studentId);
    return { studentCode: record?.studentCode ?? String(studentId), fullName: record?.fullName ?? '' };
  }

  /** AC-1, AC-2: the student and HR of the company hear of a new interview, or a new time. */
  async scheduled(
    tx: DbTx,
    type: Extract<NotificationType, 'INTERVIEW_SCHEDULED' | 'INTERVIEW_RESCHEDULED'>,
    interview: InterviewRecord,
    nomination: PublishedNomination,
    jd: AllocationJd,
  ): Promise<PendingNotifications[]> {
    const student = await this.studentOf(nomination.studentId);
    const base = {
      interviewId: interview.id,
      nominationId: nomination.id,
      jd: jdOf(jd),
      student: { studentCode: student.studentCode, fullName: student.fullName || student.studentCode },
      scheduledAt: interview.scheduledAt.toISOString(),
      mode: interview.mode,
      location: interview.location,
    };
    const dedupeKey =
      type === 'INTERVIEW_SCHEDULED'
        ? DEDUPE_KEYS.interviewScheduled(interview.id)
        : DEDUPE_KEYS.interviewRescheduled(interview.id, interview.rowVersion);
    const audiences = [
      { audience: 'STUDENT' as const, userIds: await this.users.userIdsForStudents([nomination.studentId]) },
      { audience: 'HR' as const, userIds: await this.users.hrUserIdsOfCompany(jd.companyId) },
    ];
    const pending: PendingNotifications[] = [];
    for (const { audience, userIds } of audiences) {
      if (userIds.length === 0) continue;
      pending.push(
        await this.notifications.notify(
          { type, payload: { audience, ...base }, userIds, channels: ['IN_APP'], dedupeKey },
          { tx },
        ),
      );
    }
    return pending;
  }

  /** AC-2: HR of the company hears the student's one request for another time. */
  async rescheduleRequested(
    tx: DbTx,
    interview: InterviewRecord,
    nomination: PublishedNomination,
    jd: AllocationJd,
  ): Promise<PendingNotifications[]> {
    const userIds = await this.users.hrUserIdsOfCompany(jd.companyId);
    if (userIds.length === 0 || !interview.rescheduleNote) return [];
    const student = await this.studentOf(nomination.studentId);
    return [
      await this.notifications.notify(
        {
          type: 'INTERVIEW_RESCHEDULE_REQUESTED',
          payload: {
            interviewId: interview.id,
            nominationId: nomination.id,
            jd: jdOf(jd),
            student: { studentCode: student.studentCode, fullName: student.fullName || student.studentCode },
            scheduledAt: interview.scheduledAt.toISOString(),
            note: interview.rescheduleNote,
          },
          userIds,
          channels: ['IN_APP'],
          dedupeKey: DEDUPE_KEYS.interviewRescheduleRequested(interview.id),
        },
        { tx },
      ),
    ];
  }

  /** AC-3, AC-5, AC-7: the student hears where the nomination went, with the offer when PASSED. */
  async result(
    tx: DbTx,
    nomination: PublishedNomination,
    jd: AllocationJd,
    status: InterviewOutcome,
    promoted: boolean,
    offer: OfferRecord | null,
  ): Promise<PendingNotifications[]> {
    const userIds = await this.users.userIdsForStudents([nomination.studentId]);
    if (userIds.length === 0) return [];
    return [
      await this.notifications.notify(
        {
          type: 'INTERVIEW_RESULT',
          payload: {
            nominationId: nomination.id,
            jd: jdOf(jd),
            status,
            promoted,
            offer: offer ? { offerId: offer.id, expiresAt: offer.expiresAt.toISOString() } : null,
          },
          userIds,
          channels: ['IN_APP'],
          dedupeKey: DEDUPE_KEYS.interviewResult(nomination.id, status),
        },
        { tx },
      ),
    ];
  }

  /** AC-9: the student hears the reserve ended without a place. */
  async reserveClosed(
    tx: DbTx,
    nomination: PublishedNomination,
    jd: AllocationJd,
    reason: 'RESERVE_EXPIRED' | 'JD_FILLED',
  ): Promise<PendingNotifications[]> {
    const userIds = await this.users.userIdsForStudents([nomination.studentId]);
    if (userIds.length === 0) return [];
    return [
      await this.notifications.notify(
        {
          type: 'RESERVE_CLOSED',
          payload: { nominationId: nomination.id, jd: jdOf(jd), reason },
          userIds,
          channels: ['IN_APP'],
          dedupeKey: DEDUPE_KEYS.reserveClosed(nomination.id),
        },
        { tx },
      ),
    ];
  }

  /** AC-6, AC-7: HR of the company and the center hear the answer, who was promoted, whether the JD is full. */
  async offerAnswered(
    tx: DbTx,
    input: {
      offer: OfferRecord;
      nomination: PublishedNomination;
      jd: AllocationJd;
      response: OfferResponse;
      promoted: readonly PublishedNomination[];
      jdFilled: boolean;
    },
  ): Promise<PendingNotifications[]> {
    const student = await this.studentOf(input.nomination.studentId);
    const [first] = input.promoted;
    const promoted = first ? await this.studentOf(first.studentId) : null;
    const base = {
      campaignId: input.nomination.campaignId,
      offerId: input.offer.id,
      nominationId: input.nomination.id,
      jd: jdOf(input.jd),
      student: { studentCode: student.studentCode, fullName: student.fullName || student.studentCode },
      response: input.response,
      promoted: promoted ? { studentCode: promoted.studentCode, fullName: promoted.fullName || promoted.studentCode } : null,
      jdFilled: input.jdFilled,
    };
    const audiences = [
      { audience: 'HR' as const, userIds: await this.users.hrUserIdsOfCompany(input.jd.companyId) },
      { audience: 'CENTER' as const, userIds: await this.users.centerUserIds() },
    ];
    const pending: PendingNotifications[] = [];
    for (const { audience, userIds } of audiences) {
      if (userIds.length === 0) continue;
      pending.push(
        await this.notifications.notify(
          {
            type: 'OFFER_ANSWERED',
            payload: { audience, ...base },
            userIds,
            channels: ['IN_APP'],
            dedupeKey: DEDUPE_KEYS.offerAnswered(input.offer.id),
          },
          { tx },
        ),
      );
    }
    return pending;
  }

  /** After commit: stored rows reach SSE; a failure only logs, the bell shows them on the next load (LESSONS §44). */
  async push(pending: readonly PendingNotifications[], what: string): Promise<void> {
    for (const notice of pending) {
      try {
        await this.notifications.push(notice);
      } catch (error) {
        this.logger.warn(`${what}: notices not pushed: ${errorMessage(error)}`);
      }
    }
  }
}
