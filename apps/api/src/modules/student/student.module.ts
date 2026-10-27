import { Module, type OnModuleInit } from '@nestjs/common';
import { StateModule } from '../../common/state/index.js';
import { AiGatewayModule } from '../aigateway/index.js';
import { AuditModule } from '../audit/index.js';
import { CampaignModule, CampaignService } from '../campaign/index.js';
import { SkillsModule } from '../skills/index.js';
import { ConsentController } from './api/consent.controller.js';
import { CvController } from './api/cv.controller.js';
import { CvProfileController } from './api/cv-profile.controller.js';
import { ConsentService } from './application/consent.service.js';
import { CvAnalysisService } from './application/cv-analysis.service.js';
import { CvProfileService } from './application/cv-profile.service.js';
import { CvService } from './application/cv.service.js';
import { StudentService } from './application/student.service.js';
import { ConsentRepository } from './infrastructure/consent.repository.js';
import { CvRepository } from './infrastructure/cv.repository.js';

@Module({
  imports: [CampaignModule, AuditModule, StateModule, AiGatewayModule, SkillsModule],
  controllers: [ConsentController, CvController, CvProfileController],
  providers: [
    StudentService,
    ConsentService,
    CvService,
    CvAnalysisService,
    CvProfileService,
    ConsentRepository,
    CvRepository,
  ],
  exports: [StudentService, ConsentService, CvService, CvAnalysisService],
})
export class StudentModule implements OnModuleInit {
  constructor(
    private readonly campaigns: CampaignService,
    private readonly students: StudentService,
  ) {}

  /** Tells the campaign module which campaigns a student takes part in, without it importing us (CONTEXT D27). */
  onModuleInit(): void {
    this.campaigns.useStudentAudience((studentId) => this.students.findAudience(studentId));
  }
}
