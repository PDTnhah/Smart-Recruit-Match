import { Module } from '@nestjs/common';
import { StateModule } from '../../common/state/index.js';
import { AllocationModule } from '../allocation/index.js';
import { AuditModule } from '../audit/index.js';
import { CampaignModule } from '../campaign/index.js';
import { CompanyModule } from '../company/index.js';
import { IamModule } from '../iam/index.js';
import { MatchingModule } from '../matching/index.js';
import { NotificationModule } from '../notification/index.js';
import { StudentModule } from '../student/index.js';
import { InterviewController, OfferController } from './api/interview.controller.js';
import { InterviewAccessService } from './application/interview-access.js';
import { InterviewNoticeService } from './application/interview-notices.js';
import { InterviewQueryService } from './application/interview-query.service.js';
import { InterviewResultService } from './application/interview-result.service.js';
import { InterviewScheduleService } from './application/interview-schedule.service.js';
import { InterviewSweepScheduler } from './application/interview-sweep.scheduler.js';
import { OfferService } from './application/offer.service.js';
import { SlotService } from './application/slot.service.js';
import { InterviewRepository } from './infrastructure/interview.repository.js';

/**
 * Interviews, reserves and internship offers of GĐ9 (ARCHITECTURE › Các module, FR-30, FR-31,
 * US-5.4, CONTEXT D66). Owns `interviews` and `offers`; moves nominations through the allocation
 * module's NominationService, preferences through matching, a full JD through company (Invariant
 * 13). Relies on the global DbModule and ClockModule set up in AppModule.
 */
@Module({
  imports: [
    StateModule,
    AuditModule,
    CampaignModule,
    CompanyModule,
    StudentModule,
    MatchingModule,
    AllocationModule,
    IamModule,
    NotificationModule,
  ],
  controllers: [InterviewController, OfferController],
  providers: [
    InterviewRepository,
    InterviewAccessService,
    InterviewNoticeService,
    SlotService,
    InterviewScheduleService,
    InterviewResultService,
    OfferService,
    InterviewQueryService,
    InterviewSweepScheduler,
  ],
})
export class InterviewModule {}
