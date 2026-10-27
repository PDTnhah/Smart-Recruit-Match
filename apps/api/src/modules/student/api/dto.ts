import {
  AcceptConsentRequestSchema,
  CenterCvListQuerySchema,
  CenterCvListSchema,
  ConsentListSchema,
  ConsentSchema,
  CvListQuerySchema,
  CvListSchema,
  CvProfileQuerySchema,
  CvProfileViewSchema,
  CvSchema,
  ReopenCvProfileRequestSchema,
  SaveCvProfileRequestSchema,
  SubmitCvFieldsSchema,
} from '@srm/shared';
import { createZodDto } from 'nestjs-zod';

// DTO classes over the shared Zod schemas (AD-6): the web validates with the same schemas.

export class AcceptConsentRequestDto extends createZodDto(AcceptConsentRequestSchema) {}
export class ConsentDto extends createZodDto(ConsentSchema) {}
export class ConsentListDto extends createZodDto(ConsentListSchema) {}

export class SubmitCvFieldsDto extends createZodDto(SubmitCvFieldsSchema) {}
export class CvListQueryDto extends createZodDto(CvListQuerySchema) {}
export class CvDto extends createZodDto(CvSchema) {}
export class CvListDto extends createZodDto(CvListSchema) {}
export class CenterCvListQueryDto extends createZodDto(CenterCvListQuerySchema) {}
export class CenterCvListDto extends createZodDto(CenterCvListSchema) {}

export class CvProfileQueryDto extends createZodDto(CvProfileQuerySchema) {}
export class CvProfileViewDto extends createZodDto(CvProfileViewSchema) {}
export class SaveCvProfileRequestDto extends createZodDto(SaveCvProfileRequestSchema) {}
export class ReopenCvProfileRequestDto extends createZodDto(ReopenCvProfileRequestSchema) {}
