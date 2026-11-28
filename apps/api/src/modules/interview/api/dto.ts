import {
  InterviewResultRequestSchema,
  InterviewResultResponseSchema,
  InterviewViewSchema,
  JdInterviewListSchema,
  MyInterviewsSchema,
  OfferAnswerResponseSchema,
  RescheduleInterviewRequestSchema,
  RescheduleRequestBodySchema,
  RowVersionBodySchema,
  ScheduleInterviewRequestSchema,
  StaffInterviewViewSchema,
} from '@srm/shared';
import { createZodDto } from 'nestjs-zod';

// DTO classes over the shared Zod schemas (AD-6).

export class ScheduleInterviewRequestDto extends createZodDto(ScheduleInterviewRequestSchema) {}

export class RescheduleInterviewRequestDto extends createZodDto(RescheduleInterviewRequestSchema) {}

export class RescheduleRequestBodyDto extends createZodDto(RescheduleRequestBodySchema) {}

export class RowVersionBodyDto extends createZodDto(RowVersionBodySchema) {}

export class InterviewResultRequestDto extends createZodDto(InterviewResultRequestSchema) {}

export class InterviewViewDto extends createZodDto(InterviewViewSchema) {}

export class StaffInterviewViewDto extends createZodDto(StaffInterviewViewSchema) {}

export class InterviewResultResponseDto extends createZodDto(InterviewResultResponseSchema) {}

export class OfferAnswerResponseDto extends createZodDto(OfferAnswerResponseSchema) {}

export class JdInterviewListDto extends createZodDto(JdInterviewListSchema) {}

export class MyInterviewsDto extends createZodDto(MyInterviewsSchema) {}
