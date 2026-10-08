import { Module } from '@nestjs/common';
import { StudentService } from './application/student.service.js';

@Module({
  providers: [StudentService],
  exports: [StudentService],
})
export class StudentModule {}
