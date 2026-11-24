import { Module } from '@nestjs/common';
import { StateModule } from '../../common/state/index.js';
import { AllocationModule } from '../allocation/index.js';
import { AssessmentModule } from '../assessment/index.js';
import { AuditModule } from '../audit/index.js';
import { CampaignModule } from '../campaign/index.js';
import { CompanyModule } from '../company/index.js';
import { IamModule } from '../iam/index.js';
import { MatchingModule } from '../matching/index.js';
import { NotificationModule } from '../notification/index.js';
import { StudentModule } from '../student/index.js';
import {
  MeNominationReviewsController,
  NominationReviewController,
  ReviewDeadlinesController,
} from './api/nomination-review.controller.js';
import { HrDecisionService } from './application/hr-decision.service.js';
import { NominationQueryService } from './application/nomination-query.service.js';
import { ReviewDeadlineService } from './application/review-deadline.service.js';
import { ReviewSlaScheduler } from './application/review-sla.scheduler.js';
import { SupplementRequestService } from './application/supplement-request.service.js';
import { ReviewRepository } from './infrastructure/review.repository.js';

/**
 * HR review of GĐ8 (ARCHITECTURE › Các module, FR-28, FR-29, US-5.3, CONTEXT D64, D65): HR reads
 * and decides on the nominations of its JDs, asks for more candidates, and HR's deadline is
 * reminded. Nominations belong to `allocation` and are read and moved through its NominationService;
 * relies on the global DbModule, ClockModule and StorageModule set up in AppModule.
 */
@Module({
  imports: [
    StateModule,
    AuditModule,
    CampaignModule,
    CompanyModule,
    StudentModule,
    MatchingModule,
    AssessmentModule,
    AllocationModule,
    IamModule,
    NotificationModule,
  ],
  controllers: [NominationReviewController, ReviewDeadlinesController, MeNominationReviewsController],
  providers: [
    ReviewRepository,
    ReviewDeadlineService,
    SupplementRequestService,
    NominationQueryService,
    HrDecisionService,
    ReviewSlaScheduler,
  ],
  exports: [ReviewDeadlineService, SupplementRequestService],
})
export class ReviewModule {}
