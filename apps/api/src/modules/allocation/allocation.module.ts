import { Module } from '@nestjs/common';
import { StateModule } from '../../common/state/index.js';
import { AssessmentModule } from '../assessment/index.js';
import { AuditModule } from '../audit/index.js';
import { CampaignModule } from '../campaign/index.js';
import { CompanyModule } from '../company/index.js';
import { IamModule } from '../iam/index.js';
import { MatchingModule } from '../matching/index.js';
import { NotificationModule } from '../notification/index.js';
import { StudentModule } from '../student/index.js';
import { AllocationRoundsController, CampaignAllocationRoundsController } from './api/allocation-rounds.controller.js';
import { MeAllocationResultsController } from './api/me-allocation-results.controller.js';
import { AllocationRoundService } from './application/allocation-round.service.js';
import { AllocationViewService } from './application/allocation-view.service.js';
import { ALLOCATION_ENGINE, DEFERRED_ACCEPTANCE_ENGINE } from './application/engine.js';
import { NominationService } from './application/nomination.service.js';
import { AllocationRoundRepository } from './infrastructure/allocation-round.repository.js';

/**
 * Allocation of GĐ7 (ARCHITECTURE › Các module, FR-26, FR-27, US-5.1, US-5.2, CONTEXT D64): the pure
 * engine in `domain/`, and the rounds and nominations this module owns. Reads preferences, tests,
 * students, JDs and accounts through the services those modules export; relies on the global
 * DbModule, RedisModule and ClockModule set up in AppModule.
 */
@Module({
  imports: [
    StateModule,
    AuditModule,
    CampaignModule,
    StudentModule,
    CompanyModule,
    MatchingModule,
    AssessmentModule,
    IamModule,
    NotificationModule,
  ],
  controllers: [CampaignAllocationRoundsController, AllocationRoundsController, MeAllocationResultsController],
  providers: [
    AllocationRoundService,
    AllocationViewService,
    AllocationRoundRepository,
    NominationService,
    { provide: ALLOCATION_ENGINE, useValue: DEFERRED_ACCEPTANCE_ENGINE },
  ],
  exports: [AllocationRoundService, AllocationViewService, NominationService],
})
export class AllocationModule {}
