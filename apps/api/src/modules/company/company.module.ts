import { Module } from '@nestjs/common';
import { StateModule } from '../../common/state/index.js';
import { AiGatewayModule } from '../aigateway/index.js';
import { AuditModule } from '../audit/index.js';
import { CampaignModule } from '../campaign/index.js';
import { IamModule } from '../iam/index.js';
import { NotificationModule } from '../notification/index.js';
import { CompanyController } from './api/company.controller.js';
import { JdRequirementsController } from './api/jd-requirements.controller.js';
import { JdController } from './api/jd.controller.js';
import { CompanyService } from './application/company.service.js';
import { JdAnalysisService } from './application/jd-analysis.service.js';
import { JdRequirementsService } from './application/jd-requirements.service.js';
import { JdService } from './application/jd.service.js';
import { CompanyRepository } from './infrastructure/company.repository.js';
import { JdRepository } from './infrastructure/jd.repository.js';

/**
 * Companies, HR invitations, JDs and their normalised requirements (ARCHITECTURE › Các module,
 * GĐ1). Uses the exported services of iam (invitations, recipients), campaign (phase checks),
 * aigateway (JD analysis jobs) and notification (in-app notices); relies on the global DbModule,
 * ClockModule, StorageModule and EventEmitterModule set up in AppModule.
 */
@Module({
  imports: [StateModule, AuditModule, CampaignModule, IamModule, AiGatewayModule, NotificationModule],
  controllers: [CompanyController, JdController, JdRequirementsController],
  providers: [CompanyService, JdService, JdAnalysisService, JdRequirementsService, CompanyRepository, JdRepository],
  exports: [CompanyService, JdService],
})
export class CompanyModule {}
