import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  fileId,
  type HrReview,
  type JdNominationList,
  type MyNominationReviews,
  type NominationDetail,
  NOMINATION_INVITED_STATES,
  type NominationStatus,
} from '@srm/shared';
import { type AuthUser, canAccessRecord } from '../../../common/auth/index.js';
import { EntityNotFoundError } from '../../../common/errors/index.js';
import { FileAccessRegistry, type StoredFile } from '../../../common/storage/index.js';
import type { DbTx } from '../../../db/types.js';
import { NominationService, type PublishedNomination } from '../../allocation/index.js';
import { ReviewResultsService } from '../../assessment/index.js';
import { type AllocationJd, JdService } from '../../company/index.js';
import { PreferenceReviewService } from '../../matching/index.js';
import { CvService, StudentService, studentIdOf } from '../../student/index.js';
import { NOMINATION_ENTITY } from '../domain/audit-actions.js';
import { deadlineKey, type HrReviewRecord, ReviewRepository } from '../infrastructure/review.repository.js';
import { ReviewDeadlineService } from './review-deadline.service.js';
import { SupplementRequestService } from './supplement-request.service.js';

/** A nomination HR may read, with the JD it belongs to. */
export interface OwnNomination {
  nomination: PublishedNomination;
  jd: AllocationJd;
}

const INVITED: ReadonlySet<NominationStatus> = new Set(NOMINATION_INVITED_STATES);

function reviewOf(record: HrReviewRecord | undefined): HrReview | null {
  return record
    ? { decision: record.decision, reasonCode: record.reasonCode, note: record.note, decidedAt: record.decidedAt.toISOString() }
    : null;
}

/**
 * What HR reads of nominations (GĐ8, FR-28, US-5.3 AC-1–AC-3, BR-11): the nominations of a JD of
 * HR's own company in published rounds, and one of them with its evidence. Record-level access is
 * checked here (Invariant 7): another company's JD or nomination, or a draft's, answers 404 like a
 * missing one. Data of other modules comes through their exported services (Invariant 13). Nothing
 * here asks an LLM, and nothing but scores orders the list (BR-13).
 */
@Injectable()
export class NominationQueryService implements OnModuleInit {
  constructor(
    private readonly repository: ReviewRepository,
    private readonly nominations: NominationService,
    private readonly deadlines: ReviewDeadlineService,
    private readonly supplements: SupplementRequestService,
    private readonly jds: JdService,
    private readonly students: StudentService,
    private readonly cvs: CvService,
    private readonly preferences: PreferenceReviewService,
    private readonly results: ReviewResultsService,
    private readonly files: FileAccessRegistry,
  ) {}

  onModuleInit(): void {
    this.files.register('nomination', (user, id) => this.cvFileOf(user, id));
  }

  /**
   * BR-11: a nomination of a published round whose JD belongs to the caller's company (CENTER and
   * ADMIN see all); 404 otherwise. With `lock`, the nomination row is locked in `tx`.
   */
  async requireOwn(user: AuthUser, id: number, options: { tx?: DbTx; lock?: 'update' } = {}): Promise<OwnNomination> {
    const nomination = await this.nominations.findPublished(id, options);
    const [jd] = nomination ? await this.jds.listAllocationJds([nomination.jdId]) : [];
    if (!nomination || !jd || !canAccessRecord(user, { companyId: jd.companyId })) {
      throw new EntityNotFoundError(NOMINATION_ENTITY, id);
    }
    return { nomination, jd };
  }

  /** AC-1: `GET /api/jds/{id}/nominations`, by S_final then the tie-breaks of US-5.1. */
  async listForJd(user: AuthUser, jdId: number): Promise<JdNominationList> {
    const jd = await this.jds.get(user, jdId); // another company's JD: 404 (BR-11)
    const items = await this.nominations.listPublishedOfJd(jdId);
    const [students, reviews, deadlines] = await Promise.all([
      this.students.allocationRecords([...new Set(items.map((item) => item.studentId))]),
      this.repository.reviewsOf(items.map((item) => item.id)),
      this.deadlines.deadlinesOf(items),
    ]);
    const invitedCount = items.filter((item) => INVITED.has(item.status)).length;
    return {
      jd: { jdId: jd.id, title: jd.title, quota: jd.quota, campaignId: jd.campaignId },
      invitedCount,
      supplement: await this.supplements.statusOf(jd, invitedCount),
      items: items.map((item) => {
        const student = students.get(item.studentId);
        return {
          nominationId: item.id,
          roundNo: item.roundNo,
          publishedAt: item.publishedAt.toISOString(),
          student: { studentId: item.studentId, studentCode: student?.studentCode ?? '', fullName: student?.fullName ?? '' },
          sCv: item.sCv,
          sTest: item.sTest,
          sFinal: item.sFinal,
          status: item.status,
          reviewDueAt: deadlines.get(deadlineKey(item.roundId, item.jdId))!.dueAt.toISOString(),
          rowVersion: item.rowVersion,
          review: reviewOf(reviews.get(item.id)),
        };
      }),
    };
  }

  /**
   * AC-2: `GET /api/nominations/{id}`: the CV (file and profile, no PII section), S_cv with the
   * evidence of each criterion, the skill map of the test, the CV trust index and the warnings of
   * the test. Never an answer key, a rubric or an answer of the test (Invariant 8); part C's answers
   * come with the trust index, as US-4.8 AC-7 provides for HR.
   */
  async detail(user: AuthUser, id: number): Promise<NominationDetail> {
    const { nomination, jd } = await this.requireOwn(user, id);
    const [students, cv, match, test, cvTrust, reviews, deadlines] = await Promise.all([
      this.students.allocationRecords([nomination.studentId]),
      this.cvs.reviewCvOf(nomination.studentId, nomination.campaignId),
      this.preferences.matchOf(nomination.preferenceId),
      this.results.testOf(nomination.studentId, nomination.jdId),
      this.results.cvTrustOf(nomination.preferenceId),
      this.repository.reviewsOf([nomination.id]),
      this.deadlines.deadlinesOf([nomination]),
    ]);
    const student = students.get(nomination.studentId);
    return {
      nominationId: nomination.id,
      rowVersion: nomination.rowVersion,
      status: nomination.status,
      roundNo: nomination.roundNo,
      publishedAt: nomination.publishedAt.toISOString(),
      reviewDueAt: deadlines.get(deadlineKey(nomination.roundId, nomination.jdId))!.dueAt.toISOString(),
      jd: { jdId: jd.jdId, title: jd.title },
      student: { studentId: nomination.studentId, studentCode: student?.studentCode ?? '', fullName: student?.fullName ?? '' },
      scores: { sCv: nomination.sCv, sTest: nomination.sTest, sFinal: nomination.sFinal },
      cv: cv ? { fileId: fileId('nomination', nomination.id), fileName: cv.fileName, profile: cv.profile } : null,
      match,
      test: test ? { submittedAt: test.submittedAt?.toISOString() ?? null, skills: test.skills } : null,
      cvTrust,
      warnings: test?.warnings ?? [],
      review: reviewOf(reviews.get(nomination.id)),
    };
  }

  /**
   * AC-6: `GET /api/me/nomination-reviews`: decisions on the student's own nominations, the reason
   * as a catalogue code only; HR's note stays with staff.
   */
  async mine(user: AuthUser): Promise<MyNominationReviews> {
    const ids = await this.nominations.publishedIdsOfStudent(studentIdOf(user));
    const reviews = await this.repository.reviewsOf(ids);
    return {
      items: ids.flatMap((nominationId) => {
        const review = reviews.get(nominationId);
        return review ? [{ nominationId, decision: review.decision, reasonCode: review.reasonCode }] : [];
      }),
    };
  }

  /** `GET /api/files/nomination:{id}/url` (AC-2, AC-3): the student's active CV of the campaign. */
  private async cvFileOf(user: AuthUser, id: number): Promise<StoredFile> {
    const { nomination } = await this.requireOwn(user, id);
    const file = await this.cvs.reviewFileOf(nomination.studentId, nomination.campaignId);
    if (!file) throw new EntityNotFoundError('file', id);
    return file;
  }
}
