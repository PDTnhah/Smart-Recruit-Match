import { Module } from '@nestjs/common';
import { StateModule } from '../../common/state/index.js';
import { AiGatewayModule } from '../aigateway/index.js';
import { AuditModule } from '../audit/index.js';
import { CampaignModule } from '../campaign/index.js';
import { CompanyModule } from '../company/index.js';
import { IamModule } from '../iam/index.js';
import { MatchingModule } from '../matching/index.js';
import { NotificationModule } from '../notification/index.js';
import { BlueprintController } from './api/blueprint.controller.js';
import { EssayGradingController } from './api/essay-grading.controller.js';
import { ExamSessionController } from './api/exam-session.controller.js';
import { ManualGradingController } from './api/manual-grading.controller.js';
import { QuestionBankController } from './api/question-bank.controller.js';
import { BlueprintService } from './application/blueprint.service.js';
import { DrawableBankCache } from './application/drawable-bank-cache.js';
import { EssayGradingService } from './application/essay-grading.service.js';
import { EssayResultsHandler } from './application/essay-results.handler.js';
import { ExamResultService } from './application/exam-result.service.js';
import { ExamScheduler } from './application/exam-scheduler.js';
import { ExamSessionService } from './application/exam-session.service.js';
import { GradingScheduler } from './application/grading.scheduler.js';
import { GradingService } from './application/grading.service.js';
import { ManualGradingService } from './application/manual-grading.service.js';
import { McqGrader } from './application/mcq-grader.js';
import { QuestionBankService } from './application/question-bank.service.js';
import { QuestionResultsHandler } from './application/question-results.handler.js';
import { NO_THRESHOLD_HOLDS, THRESHOLD_HOLDS } from './application/threshold-holds.js';
import { ThresholdScheduler } from './application/threshold.scheduler.js';
import { EssayGradingRunsRepository } from './infrastructure/essay-grading-runs.repository.js';
import { ExamAnswerStore } from './infrastructure/exam-answer-store.js';
import { ExamGradingRepository } from './infrastructure/exam-grading.repository.js';
import { ExamSessionsRepository } from './infrastructure/exam-sessions.repository.js';
import { ManualGradingRepository } from './infrastructure/manual-grading.repository.js';
import { QuestionBanksRepository } from './infrastructure/question-banks.repository.js';
import { QuestionGenerationRunsRepository } from './infrastructure/question-generation-runs.repository.js';

/**
 * Tests of GĐ5 (ARCHITECTURE › Các module, FR-18, FR-20, US-4.1–US-4.3): the exam blueprint of
 * each approved JD, its question bank, the generation runs of the Test Generator with the
 * Validator's verdicts, the lock, the exam room with its sweep, and grading (US-4.4): multiple
 * choice by code, essays by the Grader, S_test and S_final, the grading and threshold sweeps; and
 * manual grading of the essays the Grader handed over (US-4.5). Reads JDs, campaigns and
 * preferences through the services those modules export, finds students' accounts through
 * IamModule and notifies through NotificationModule; sends jobs through AiGatewayModule. Relies on
 * the global DbModule, RedisModule, ClockModule and EventEmitterModule set up in AppModule.
 */
@Module({
  imports: [
    StateModule,
    AuditModule,
    CampaignModule,
    CompanyModule,
    AiGatewayModule,
    MatchingModule,
    IamModule,
    NotificationModule,
  ],
  controllers: [
    BlueprintController,
    QuestionBankController,
    ExamSessionController,
    EssayGradingController,
    ManualGradingController,
  ],
  providers: [
    QuestionBankService,
    BlueprintService,
    QuestionResultsHandler,
    QuestionBanksRepository,
    QuestionGenerationRunsRepository,
    DrawableBankCache,
    ExamSessionService,
    ExamScheduler,
    ExamSessionsRepository,
    ExamAnswerStore,
    McqGrader,
    GradingService,
    EssayGradingService,
    EssayResultsHandler,
    ExamResultService,
    GradingScheduler,
    ThresholdScheduler,
    ExamGradingRepository,
    EssayGradingRunsRepository,
    ManualGradingService,
    ManualGradingRepository,
    // US-4.6 replaces it to hold back sessions with an open appeal.
    { provide: THRESHOLD_HOLDS, useValue: NO_THRESHOLD_HOLDS },
  ],
  exports: [QuestionBankService, GradingService],
})
export class AssessmentModule {}
