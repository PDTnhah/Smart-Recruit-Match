import { Module } from '@nestjs/common';
import { AiGatewayModule } from '../aigateway/index.js';
import { CampaignModule } from '../campaign/index.js';
import { CompanyModule } from '../company/index.js';
import { SkillsModule } from '../skills/index.js';
import { StudentModule } from '../student/index.js';
import { MatchingRunsController } from './api/matching-runs.controller.js';
import { MatchResultsHandler } from './application/match-results.handler.js';
import { MatchingPhaseListener } from './application/phase-changed.listener.js';
import { RecomputeScvService } from './application/recompute-scv.js';
import { RunMatchingService } from './application/run-matching.service.js';
import { MatchResultsRepository } from './infrastructure/match-results.repository.js';
import { MatchRunsRepository } from './infrastructure/match-runs.repository.js';

/**
 * Matching of GĐ3 (ARCHITECTURE › Các module, FR-14, US-3.1–US-3.6, US-3.2): the pure scoring rules
 * in `domain/`, matching runs and their results. Reads CVs, students, JDs and the skill taxonomy
 * through the services those modules export; relies on the global DbModule, ClockModule and
 * EventEmitterModule set up in AppModule.
 */
@Module({
  imports: [CampaignModule, StudentModule, CompanyModule, SkillsModule, AiGatewayModule],
  controllers: [MatchingRunsController],
  providers: [
    RunMatchingService,
    MatchingPhaseListener,
    MatchResultsHandler,
    RecomputeScvService,
    MatchResultsRepository,
    MatchRunsRepository,
  ],
  exports: [RunMatchingService, RecomputeScvService],
})
export class MatchingModule {}
