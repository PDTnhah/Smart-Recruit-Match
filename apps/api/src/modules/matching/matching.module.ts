import { Module } from '@nestjs/common';
import { AiGatewayModule } from '../aigateway/index.js';
import { AuditModule } from '../audit/index.js';
import { CampaignModule } from '../campaign/index.js';
import { CompanyModule } from '../company/index.js';
import { IamModule } from '../iam/index.js';
import { NotificationModule } from '../notification/index.js';
import { SkillsModule } from '../skills/index.js';
import { StudentModule } from '../student/index.js';
import { MatchingRunsController } from './api/matching-runs.controller.js';
import { MePreferencesController } from './api/me-preferences.controller.js';
import { MeShortlistController } from './api/me-shortlist.controller.js';
import { AutoAssignPreferencesService } from './application/auto-assign-preferences.service.js';
import { MatchResultsHandler } from './application/match-results.handler.js';
import { MatchingPhaseListener } from './application/phase-changed.listener.js';
import { PreferenceAutoAssignScheduler } from './application/preference-auto-assign.scheduler.js';
import { PreferenceDeadlineReminderSource } from './application/preference-deadline.source.js';
import { PreferencesService } from './application/preferences.service.js';
import { RecomputeScvService } from './application/recompute-scv.js';
import { RunMatchingService } from './application/run-matching.service.js';
import { ShortlistService } from './application/shortlist.service.js';
import { MatchResultsRepository } from './infrastructure/match-results.repository.js';
import { MatchRunsRepository } from './infrastructure/match-runs.repository.js';
import { PreferencesRepository } from './infrastructure/preferences.repository.js';

/**
 * Matching of GĐ3–GĐ4 (ARCHITECTURE › Các module, FR-14–FR-16, US-3.1–US-3.6): the pure scoring
 * rules in `domain/`, matching runs and their results, students' shortlists and preference lists.
 * Reads CVs, students, JDs, the skill taxonomy and accounts through the services those modules
 * export and notifies through NotificationModule; relies on the global DbModule, ClockModule,
 * ScheduleModule and EventEmitterModule set up in AppModule.
 */
@Module({
  imports: [
    AuditModule,
    CampaignModule,
    StudentModule,
    CompanyModule,
    SkillsModule,
    AiGatewayModule,
    IamModule,
    NotificationModule,
  ],
  controllers: [MatchingRunsController, MeShortlistController, MePreferencesController],
  providers: [
    RunMatchingService,
    MatchingPhaseListener,
    MatchResultsHandler,
    RecomputeScvService,
    ShortlistService,
    PreferencesService,
    AutoAssignPreferencesService,
    PreferenceAutoAssignScheduler,
    PreferenceDeadlineReminderSource,
    MatchResultsRepository,
    MatchRunsRepository,
    PreferencesRepository,
  ],
  exports: [RunMatchingService, RecomputeScvService],
})
export class MatchingModule {}
