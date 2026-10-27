import { Module } from '@nestjs/common';
import { StateModule } from '../../common/state/index.js';
import { AiGatewayModule } from '../aigateway/index.js';
import { AuditModule } from '../audit/index.js';
import { AdminSkillsController } from './api/admin-skills.controller.js';
import { SkillsController } from './api/skills.controller.js';
import { NewSkillsService } from './application/new-skills.service.js';
import { SkillCatalogService } from './application/skill-catalog.service.js';
import { SkillReviewService } from './application/skill-review.service.js';
import { SkillRepository } from './infrastructure/skill.repository.js';

/**
 * The skill catalogue (FR-13, US-2.5, CONTEXT D39): lookup for every role, ADMIN review of the
 * new skills the AI finds, and the SKILL_NORMALIZE jobs that suggest names for them. Owns
 * core.skills; listens to the CV and JD results of aigateway; relies on the global DbModule and
 * EventEmitterModule set up in AppModule.
 */
@Module({
  imports: [StateModule, AuditModule, AiGatewayModule],
  controllers: [SkillsController, AdminSkillsController],
  providers: [SkillCatalogService, SkillReviewService, NewSkillsService, SkillRepository],
  exports: [SkillCatalogService],
})
export class SkillsModule {}
