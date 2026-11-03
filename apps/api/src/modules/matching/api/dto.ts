import { MatchingRunSchema } from '@srm/shared';
import { createZodDto } from 'nestjs-zod';

// DTO classes over the shared Zod schemas (AD-6).

export class MatchingRunDto extends createZodDto(MatchingRunSchema) {}
