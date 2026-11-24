import {
  BankQuestionListSchema,
  CvTrustViewSchema,
  EssayGradingDispatchSchema,
  ExamBlueprintViewSchema,
  ExamPaperSchema,
  ExamResultSchema,
  ExamSubmissionSchema,
  GradingQueueQuerySchema,
  GradingQueueSchema,
  LockQuestionBankRequestSchema,
  ManualGradeRequestSchema,
  ManualQuestionListSchema,
  ManualGradeResultSchema,
  ManualGradingDetailSchema,
  MyExamsResponseSchema,
  QuestionGenerationRunSchema,
  QuestionImportPreviewSchema,
  QuestionImportTemplateQuerySchema,
  QuestionReviewSampleSchema,
  RejectQuestionRequestSchema,
  RejectQuestionResultSchema,
  SaveExamAnswersRequestSchema,
  SaveExamAnswersResultSchema,
  SaveManualQuestionsRequestSchema,
  SaveManualQuestionsResultSchema,
  SubmitQuestionReviewRequestSchema,
  UpdateExamBlueprintRequestSchema,
} from '@srm/shared';
import { createZodDto } from 'nestjs-zod';

// DTO classes over the shared Zod schemas (AD-6).

export class ExamBlueprintViewDto extends createZodDto(ExamBlueprintViewSchema) {}

export class UpdateExamBlueprintRequestDto extends createZodDto(UpdateExamBlueprintRequestSchema) {}

export class QuestionGenerationRunDto extends createZodDto(QuestionGenerationRunSchema) {}

export class LockQuestionBankRequestDto extends createZodDto(LockQuestionBankRequestSchema) {}

// Sample review of a question bank (US-4.9): answer keys go to HR and CENTER only (Invariant 8).

export class QuestionReviewSampleDto extends createZodDto(QuestionReviewSampleSchema) {}

export class SubmitQuestionReviewRequestDto extends createZodDto(SubmitQuestionReviewRequestSchema) {}

// Every question of a bank, and CENTER rejecting one (US-4.11): answer keys go to CENTER only (Invariant 8).

export class BankQuestionListDto extends createZodDto(BankQuestionListSchema) {}

export class RejectQuestionRequestDto extends createZodDto(RejectQuestionRequestSchema) {}

export class RejectQuestionResultDto extends createZodDto(RejectQuestionResultSchema) {}

// Questions added by hand (US-4.13): answer keys go to HR and CENTER only (Invariant 8).

export class QuestionImportTemplateQueryDto extends createZodDto(QuestionImportTemplateQuerySchema) {}

export class QuestionImportPreviewDto extends createZodDto(QuestionImportPreviewSchema) {}

export class SaveManualQuestionsRequestDto extends createZodDto(SaveManualQuestionsRequestSchema) {}

export class SaveManualQuestionsResultDto extends createZodDto(SaveManualQuestionsResultSchema) {}

export class ManualQuestionListDto extends createZodDto(ManualQuestionListSchema) {}

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

// Part C (US-4.8): staff only, never the student.

export class CvTrustViewDto extends createZodDto(CvTrustViewSchema) {}
