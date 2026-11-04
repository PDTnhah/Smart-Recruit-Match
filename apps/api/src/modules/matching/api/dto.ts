import {
  MatchingRunSchema,
  PreferenceListSchema,
  ReplacePreferencesRequestSchema,
  ShortlistResponseSchema,
} from '@srm/shared';
import { createZodDto } from 'nestjs-zod';

// DTO classes over the shared Zod schemas (AD-6).

export class MatchingRunDto extends createZodDto(MatchingRunSchema) {}

export class ShortlistResponseDto extends createZodDto(ShortlistResponseSchema) {}

export class ReplacePreferencesRequestDto extends createZodDto(ReplacePreferencesRequestSchema) {}

export class PreferenceListDto extends createZodDto(PreferenceListSchema) {}
