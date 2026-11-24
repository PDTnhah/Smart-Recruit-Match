import {
  HrDecisionRequestSchema,
  HrDecisionResultSchema,
  JdNominationListSchema,
  MyNominationReviewsSchema,
  NominationDetailSchema,
  ReviewDeadlineExtensionRequestSchema,
  ReviewDeadlineListSchema,
  ReviewDeadlineSchema,
  SupplementRequestBodySchema,
  SupplementRequestSchema,
} from '@srm/shared';
import { createZodDto } from 'nestjs-zod';

// DTO classes over the shared Zod schemas (AD-6).

export class JdNominationListDto extends createZodDto(JdNominationListSchema) {}

export class NominationDetailDto extends createZodDto(NominationDetailSchema) {}

export class HrDecisionRequestDto extends createZodDto(HrDecisionRequestSchema) {}

export class HrDecisionResultDto extends createZodDto(HrDecisionResultSchema) {}

export class SupplementRequestBodyDto extends createZodDto(SupplementRequestBodySchema) {}

export class SupplementRequestDto extends createZodDto(SupplementRequestSchema) {}

export class ReviewDeadlineExtensionRequestDto extends createZodDto(ReviewDeadlineExtensionRequestSchema) {}

export class ReviewDeadlineDto extends createZodDto(ReviewDeadlineSchema) {}

export class ReviewDeadlineListDto extends createZodDto(ReviewDeadlineListSchema) {}

export class MyNominationReviewsDto extends createZodDto(MyNominationReviewsSchema) {}
