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
import { ExamSessionController } from './api/exam-session.controller.js';
import { QuestionBankController } from './api/question-bank.controller.js';
import { BlueprintService } from './application/blueprint.service.js';
import { DrawableBankCache } from './application/drawable-bank-cache.js';
import { ExamScheduler } from './application/exam-scheduler.js';
import { ExamSessionService } from './application/exam-session.service.js';
import { QuestionBankService } from './application/question-bank.service.js';
import { QuestionResultsHandler } from './application/question-results.handler.js';
import { ExamAnswerStore } from './infrastructure/exam-answer-store.js';
import { ExamSessionsRepository } from './infrastructure/exam-sessions.repository.js';
import { QuestionBanksRepository } from './infrastructure/question-banks.repository.js';
import { QuestionGenerationRunsRepository } from './infrastructure/question-generation-runs.repository.js';

/**
 * Tests of GĐ5 (ARCHITECTURE › Các module, FR-18, FR-20, US-4.1–US-4.3): the exam blueprint of
 * each approved JD, its question bank, the generation runs of the Test Generator with the
 * Validator's verdicts, the lock, and the exam room with its sweep. Reads JDs, campaigns and
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
  controllers: [BlueprintController, QuestionBankController, ExamSessionController],
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
  ],
  exports: [QuestionBankService],
})
export class AssessmentModule {}
