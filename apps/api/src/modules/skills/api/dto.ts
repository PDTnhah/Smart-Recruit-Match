import {
  AdminSkillListQuerySchema,
  AdminSkillListSchema,
  AdminSkillSchema,
  ApproveSkillRequestSchema,
  CatalogSkillListSchema,
  MergeSkillRequestSchema,
  RejectSkillRequestSchema,
  SkillSearchQuerySchema,
} from '@srm/shared';
import { createZodDto } from 'nestjs-zod';

// DTO classes over the shared Zod schemas (AD-6): the web forms validate with the same schemas.

export class SkillSearchQueryDto extends createZodDto(SkillSearchQuerySchema) {}
export class CatalogSkillListDto extends createZodDto(CatalogSkillListSchema) {}

export class AdminSkillListQueryDto extends createZodDto(AdminSkillListQuerySchema) {}
export class AdminSkillDto extends createZodDto(AdminSkillSchema) {}
export class AdminSkillListDto extends createZodDto(AdminSkillListSchema) {}
export class ApproveSkillRequestDto extends createZodDto(ApproveSkillRequestSchema) {}
export class MergeSkillRequestDto extends createZodDto(MergeSkillRequestSchema) {}
export class RejectSkillRequestDto extends createZodDto(RejectSkillRequestSchema) {}
