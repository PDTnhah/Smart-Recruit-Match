import { Module } from '@nestjs/common';
import { StateModule } from '../../common/state/index.js';
import { AuditModule } from '../audit/index.js';
import { CampaignController } from './api/campaign.controller.js';
import { CampaignPhaseScheduler } from './application/campaign-phase.scheduler.js';
import { CampaignService } from './application/campaign.service.js';
import { CampaignRepository } from './infrastructure/campaign.repository.js';

/**
 * Campaigns, their parameters, deadlines and phases (ARCHITECTURE › Các module, GĐ0). Relies on
 * the global DbModule, ClockModule, ScheduleModule and EventEmitterModule set up in AppModule.
 */
@Module({
  imports: [StateModule, AuditModule],
  controllers: [CampaignController],
  providers: [CampaignService, CampaignRepository, CampaignPhaseScheduler],
  exports: [CampaignService],
})
export class CampaignModule {}
