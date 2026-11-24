import {
  AdjustNominationsRequestSchema,
  AllocationExplanationSchema,
  AllocationRoundListSchema,
  AllocationRoundViewSchema,
  MyAllocationResultsSchema,
  PublishAllocationRoundRequestSchema,
} from '@srm/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// DTO classes over the shared Zod schemas (AD-6).

export class AllocationRoundViewDto extends createZodDto(AllocationRoundViewSchema) {}

export class AllocationRoundListDto extends createZodDto(AllocationRoundListSchema) {}

export class AdjustNominationsRequestDto extends createZodDto(AdjustNominationsRequestSchema) {}

export class PublishAllocationRoundRequestDto extends createZodDto(PublishAllocationRoundRequestSchema) {}

export class AllocationExplanationDto extends createZodDto(AllocationExplanationSchema) {}

export class MyAllocationResultsDto extends createZodDto(MyAllocationResultsSchema) {}

const positiveId = z.coerce.number().int().positive();

/** Route parameters `:id/students/:studentId`. */
export class RoundStudentParamDto extends createZodDto(z.object({ id: positiveId, studentId: positiveId })) {}
