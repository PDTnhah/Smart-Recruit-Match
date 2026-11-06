import { ExamBlueprintViewSchema, QuestionGenerationRunSchema, UpdateExamBlueprintRequestSchema } from '@srm/shared';
import { createZodDto } from 'nestjs-zod';

// DTO classes over the shared Zod schemas (AD-6).

export class ExamBlueprintViewDto extends createZodDto(ExamBlueprintViewSchema) {}

export class UpdateExamBlueprintRequestDto extends createZodDto(UpdateExamBlueprintRequestSchema) {}

export class QuestionGenerationRunDto extends createZodDto(QuestionGenerationRunSchema) {}
