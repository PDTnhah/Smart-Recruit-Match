import { Module } from '@nestjs/common';
import { StateModule } from '../../common/state/index.js';
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
import { CompetitionService } from './application/competition.service.js';
import { LowPreferenceAlertService } from './application/low-preference-alert.service.js';
import { MatchResultsHandler } from './application/match-results.handler.js';
import { MatchingPhaseListener } from './application/phase-changed.listener.js';
import { PreferenceAutoAssignScheduler } from './application/preference-auto-assign.scheduler.js';
import { PreferenceDeadlineReminderSource } from './application/preference-deadline.source.js';
import { PreferenceExamService } from './application/preference-exam.service.js';
import { PreferenceGradingService } from './application/preference-grading.service.js';
import { PreferencesService } from './application/preferences.service.js';
import { RecomputeScvService } from './application/recompute-scv.js';
import { RunMatchingService } from './application/run-matching.service.js';
import { ShortlistService } from './application/shortlist.service.js';
import { CompetitionCounter } from './infrastructure/competition-counter.js';
import { MatchResultsRepository } from './infrastructure/match-results.repository.js';
import { MatchRunsRepository } from './infrastructure/match-runs.repository.js';
import { PreferencesRepository } from './infrastructure/preferences.repository.js';

/**
 * Matching of GĐ3–GĐ4 (ARCHITECTURE › Các module, FR-14–FR-17, US-3.1–US-3.6): the pure scoring
 * rules in `domain/`, matching runs and their results, students' shortlists and preference lists,
 * the competition level of each JD and the alert of JDs with few preferences; the preferences the
 * exam room reads and closes (US-4.3), and those grading moves with their S_final (US-4.4).
 * Reads CVs, students, JDs, the skill taxonomy and accounts through the services those modules
 * export and notifies through NotificationModule; relies on the global DbModule, ClockModule,
 * ScheduleModule and EventEmitterModule set up in AppModule.
 */
@Module({
  imports: [
    StateModule,
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
    PreferenceExamService,
    PreferenceGradingService,
    AutoAssignPreferencesService,
    PreferenceAutoAssignScheduler,
    PreferenceDeadlineReminderSource,
    CompetitionService,
    LowPreferenceAlertService,
    CompetitionCounter,
    MatchResultsRepository,
    MatchRunsRepository,
    PreferencesRepository,
  ],
  exports: [RunMatchingService, RecomputeScvService, PreferenceExamService, PreferenceGradingService],
})
export class MatchingModule {}
