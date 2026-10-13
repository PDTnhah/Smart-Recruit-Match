import { Module, type OnModuleInit } from '@nestjs/common';
import { CampaignModule, CampaignService } from '../campaign/index.js';
import { StudentService } from './application/student.service.js';

@Module({
  imports: [CampaignModule],
  providers: [StudentService],
  exports: [StudentService],
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
