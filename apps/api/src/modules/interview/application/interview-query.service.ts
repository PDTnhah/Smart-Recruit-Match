import { Injectable } from '@nestjs/common';
import type { JdInterviewList, MyInterviews, NominationStatus, OfferDeclinePolicy } from '@srm/shared';
import type { AuthUser } from '../../../common/auth/index.js';
import { NominationService } from '../../allocation/index.js';
import { CampaignService } from '../../campaign/index.js';
import { JdService } from '../../company/index.js';
import { StudentService, studentIdOf } from '../../student/index.js';
import { InterviewRepository } from '../infrastructure/interview.repository.js';
import { interviewView, offerView, staffInterviewView } from './views.js';

/** Nominations HR has not invited yet, or rejected: GĐ9 has nothing of them. */
const BEFORE_INTERVIEW: ReadonlySet<NominationStatus> = new Set(['NOMINATED', 'HR_REJECTED']);

/**
 * What GĐ9 shows (US-5.4 AC-12): a JD's invited nominations with interview and offer for HR of the
 * company and the center (404 for another company's JD, BR-11), and a student's own.
 */
@Injectable()
export class InterviewQueryService {
  constructor(
    private readonly repository: InterviewRepository,
    private readonly nominations: NominationService,
    private readonly jds: JdService,
    private readonly students: StudentService,
    private readonly campaigns: CampaignService,
  ) {}

  /** `GET /api/jds/{id}/interviews`, by S_final then the tie-breaks of US-5.1. */
  async listForJd(user: AuthUser, jdId: number): Promise<JdInterviewList> {
    const jd = await this.jds.get(user, jdId); // another company's JD: 404 (BR-11)
    const items = (await this.nominations.listPublishedOfJd(jdId)).filter((item) => !BEFORE_INTERVIEW.has(item.status));
    const ids = items.map((item) => item.id);
    const [interviews, offers, students, counts] = await Promise.all([
      this.repository.interviewsOfNominations(ids),
      this.repository.offersOfNominations(ids),
      this.students.allocationRecords(items.map((item) => item.studentId)),
      this.nominations.slotCounts(jdId),
    ]);
    return {
      jd: { jdId: jd.id, title: jd.title, campaignId: jd.campaignId },
      slots: { quota: jd.quota, ...counts },
      items: items.map((item) => {
        const student = students.get(item.studentId);
        const interview = interviews.get(item.id);
        const offer = offers.get(item.id);
        return {
          nominationId: item.id,
          nominationStatus: item.status,
          student: { studentId: item.studentId, studentCode: student?.studentCode ?? '', fullName: student?.fullName ?? '' },
          sFinal: item.sFinal,
          interview: interview ? staffInterviewView(interview) : null,
          offer: offer ? offerView(offer) : null,
        };
      }),
    };
  }

  /** `GET /api/me/interviews`: the student's invited nominations, newest first, with what declining means. */
  async mine(user: AuthUser): Promise<MyInterviews> {
    const items = (await this.nominations.listPublishedOfStudent(studentIdOf(user))).filter(
      (item) => !BEFORE_INTERVIEW.has(item.status),
    );
    const ids = items.map((item) => item.id);
    const [interviews, offers, jds] = await Promise.all([
      this.repository.interviewsOfNominations(ids),
      this.repository.offersOfNominations(ids),
      this.jds.listAllocationJds([...new Set(items.map((item) => item.jdId))]),
    ]);
    const jdOf = new Map(jds.map((jd) => [jd.jdId, jd]));
    const policies = new Map<number, OfferDeclinePolicy>();
    for (const campaignId of new Set(items.map((item) => item.campaignId))) {
      policies.set(campaignId, (await this.campaigns.getSettings(campaignId)).config.offer_decline_policy);
    }
    return {
      items: items.map((item) => {
        const jd = jdOf.get(item.jdId);
        const interview = interviews.get(item.id);
        const offer = offers.get(item.id);
        return {
          nominationId: item.id,
          nominationStatus: item.status,
          jd: { jdId: item.jdId, title: jd?.title ?? '', companyName: jd?.companyName ?? '' },
          interview: interview ? interviewView(interview) : null,
          offer: offer ? offerView(offer) : null,
          offerDeclinePolicy: policies.get(item.campaignId)!,
        };
      }),
    };
  }
}
