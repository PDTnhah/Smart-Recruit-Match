import {
  CampaignListSchema,
  CampaignSchema,
  CreateCampaignRequestSchema,
  OpenCampaignRequestSchema,
  UpdateCampaignRequestSchema,
} from '@srm/shared';
import { createZodDto } from 'nestjs-zod';

// DTO classes over the shared Zod schemas (AD-6): the web form validates with the same schemas.

export class CreateCampaignRequestDto extends createZodDto(CreateCampaignRequestSchema) {}
export class UpdateCampaignRequestDto extends createZodDto(UpdateCampaignRequestSchema) {}
export class OpenCampaignRequestDto extends createZodDto(OpenCampaignRequestSchema) {}
export class CampaignDto extends createZodDto(CampaignSchema) {}
export class CampaignListDto extends createZodDto(CampaignListSchema) {}
