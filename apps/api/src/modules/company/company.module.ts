import { Module } from '@nestjs/common';
import { StateModule } from '../../common/state/index.js';
import { AuditModule } from '../audit/index.js';
import { CampaignModule } from '../campaign/index.js';
import { IamModule } from '../iam/index.js';
import { CompanyController } from './api/company.controller.js';
import { JdController } from './api/jd.controller.js';
import { CompanyService } from './application/company.service.js';
import { JdService } from './application/jd.service.js';
import { CompanyRepository } from './infrastructure/company.repository.js';
import { JdRepository } from './infrastructure/jd.repository.js';

/**
 * Companies, HR invitations and JDs (ARCHITECTURE › Các module, GĐ1). Uses the exported services
 * of iam (invitations) and campaign (phase checks); relies on the global DbModule, ClockModule,
 * StorageModule and EventEmitterModule set up in AppModule.
 */
@Module({
  imports: [StateModule, AuditModule, CampaignModule, IamModule],
  controllers: [CompanyController, JdController],
  providers: [CompanyService, JdService, CompanyRepository, JdRepository],
  exports: [CompanyService, JdService],
})
export class CompanyModule {}
