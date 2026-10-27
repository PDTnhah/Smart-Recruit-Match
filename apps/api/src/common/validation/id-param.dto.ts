import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** `:id` route parameter: a positive integer (bigint identity keys fit in a JS number here). */
export class IdParamDto extends createZodDto(z.object({ id: z.coerce.number().int().positive() })) {}
