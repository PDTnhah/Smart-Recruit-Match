import { Module } from '@nestjs/common';
import { AiGatewayModule } from '../aigateway/index.js';
import { AuditModule } from '../audit/index.js';
import { CampaignModule } from '../campaign/index.js';
import { CompanyModule } from '../company/index.js';
import { BlueprintController } from './api/blueprint.controller.js';
import { BlueprintService } from './application/blueprint.service.js';
import { QuestionBankService } from './application/question-bank.service.js';
import { QuestionResultsHandler } from './application/question-results.handler.js';
import { QuestionBanksRepository } from './infrastructure/question-banks.repository.js';
import { QuestionGenerationRunsRepository } from './infrastructure/question-generation-runs.repository.js';

/**
 * Tests of GĐ5 (ARCHITECTURE › Các module, FR-18, US-4.1): the exam blueprint of each approved JD,
 * its question bank and the generation runs of the Test Generator. Reads JDs and campaigns through
 * the services those modules export and sends jobs through AiGatewayModule; relies on the global
 * DbModule, ClockModule and EventEmitterModule set up in AppModule.
 */
@Module({
  imports: [AuditModule, CampaignModule, CompanyModule, AiGatewayModule],
  controllers: [BlueprintController],
  providers: [
    QuestionBankService,
    BlueprintService,
    QuestionResultsHandler,
    QuestionBanksRepository,
    QuestionGenerationRunsRepository,
  ],
})
export class AssessmentModule {}
