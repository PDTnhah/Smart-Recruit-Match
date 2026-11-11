import {
  EssayGradingDispatchSchema,
  ExamBlueprintViewSchema,
  ExamPaperSchema,
  ExamResultSchema,
  ExamSubmissionSchema,
  GradingQueueQuerySchema,
  GradingQueueSchema,
  LockQuestionBankRequestSchema,
  ManualGradeRequestSchema,
  ManualGradeResultSchema,
  ManualGradingDetailSchema,
  MyExamsResponseSchema,
  QuestionGenerationRunSchema,
  SaveExamAnswersRequestSchema,
  SaveExamAnswersResultSchema,
  UpdateExamBlueprintRequestSchema,
} from '@srm/shared';
import { createZodDto } from 'nestjs-zod';

// DTO classes over the shared Zod schemas (AD-6).

export class ExamBlueprintViewDto extends createZodDto(ExamBlueprintViewSchema) {}

export class UpdateExamBlueprintRequestDto extends createZodDto(UpdateExamBlueprintRequestSchema) {}

export class QuestionGenerationRunDto extends createZodDto(QuestionGenerationRunSchema) {}

export class LockQuestionBankRequestDto extends createZodDto(LockQuestionBankRequestSchema) {}

// Exam room (US-4.3): responses are whitelists (AGENTS › Invariant 8).

export class ExamPaperDto extends createZodDto(ExamPaperSchema) {}

export class SaveExamAnswersRequestDto extends createZodDto(SaveExamAnswersRequestSchema) {}

export class SaveExamAnswersResultDto extends createZodDto(SaveExamAnswersResultSchema) {}

export class ExamSubmissionDto extends createZodDto(ExamSubmissionSchema) {}

export class MyExamsResponseDto extends createZodDto(MyExamsResponseSchema) {}

// Grading (US-4.4).

export class ExamResultDto extends createZodDto(ExamResultSchema) {}

export class EssayGradingDispatchDto extends createZodDto(EssayGradingDispatchSchema) {}

// Manual grading (US-4.5): responses are whitelists without the student (BR-03).

export class GradingQueueQueryDto extends createZodDto(GradingQueueQuerySchema) {}

export class GradingQueueDto extends createZodDto(GradingQueueSchema) {}

export class ManualGradingDetailDto extends createZodDto(ManualGradingDetailSchema) {}

export class ManualGradeRequestDto extends createZodDto(ManualGradeRequestSchema) {}

export class ManualGradeResultDto extends createZodDto(ManualGradeResultSchema) {}
