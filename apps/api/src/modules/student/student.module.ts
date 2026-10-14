import { Module, type OnModuleInit } from '@nestjs/common';
import { AuditModule } from '../audit/index.js';
import { CampaignModule, CampaignService } from '../campaign/index.js';
import { ConsentController } from './api/consent.controller.js';
import { CvController } from './api/cv.controller.js';
import { ConsentService } from './application/consent.service.js';
import { CvService } from './application/cv.service.js';
import { StudentService } from './application/student.service.js';
import { ConsentRepository } from './infrastructure/consent.repository.js';
import { CvRepository } from './infrastructure/cv.repository.js';

@Module({
  imports: [CampaignModule, AuditModule],
  controllers: [ConsentController, CvController],
  providers: [StudentService, ConsentService, CvService, ConsentRepository, CvRepository],
  exports: [StudentService, ConsentService, CvService],
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
