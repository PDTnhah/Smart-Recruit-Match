import {
  CompanyListSchema,
  CompanySchema,
  CreateCompanyRequestSchema,
  CreateJdRequestSchema,
  HrAccountListSchema,
  HrInvitationSchema,
  InviteHrRequestSchema,
  JdActionRequestSchema,
  JdListQuerySchema,
  JdListSchema,
  JdRequirementsViewSchema,
  JobDescriptionSchema,
  SaveJdRequirementsRequestSchema,
  UpdateCompanyRequestSchema,
  UpdateJdRequestSchema,
  UploadJdFileFieldsSchema,
} from '@srm/shared';
import { createZodDto } from 'nestjs-zod';

// DTO classes over the shared Zod schemas (AD-6): the web forms validate with the same schemas.

export class CreateCompanyRequestDto extends createZodDto(CreateCompanyRequestSchema) {}
export class UpdateCompanyRequestDto extends createZodDto(UpdateCompanyRequestSchema) {}
export class CompanyDto extends createZodDto(CompanySchema) {}
export class CompanyListDto extends createZodDto(CompanyListSchema) {}
export class InviteHrRequestDto extends createZodDto(InviteHrRequestSchema) {}
export class HrInvitationDto extends createZodDto(HrInvitationSchema) {}
export class HrAccountListDto extends createZodDto(HrAccountListSchema) {}

export class CreateJdRequestDto extends createZodDto(CreateJdRequestSchema) {}
export class UpdateJdRequestDto extends createZodDto(UpdateJdRequestSchema) {}
export class JdActionRequestDto extends createZodDto(JdActionRequestSchema) {}
export class UploadJdFileFieldsDto extends createZodDto(UploadJdFileFieldsSchema) {}
export class JdListQueryDto extends createZodDto(JdListQuerySchema) {}
export class JobDescriptionDto extends createZodDto(JobDescriptionSchema) {}
export class JdListDto extends createZodDto(JdListSchema) {}

export class JdRequirementsViewDto extends createZodDto(JdRequirementsViewSchema) {}
export class SaveJdRequirementsRequestDto extends createZodDto(SaveJdRequirementsRequestSchema) {}
