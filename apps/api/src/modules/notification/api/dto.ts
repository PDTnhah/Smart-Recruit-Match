import { MarkAllReadResultSchema, NotificationListQuerySchema, NotificationListSchema } from '@srm/shared';
import { createZodDto } from 'nestjs-zod';

// DTO classes over the shared Zod schemas (AD-6): the web reads the same shapes.

export class NotificationListQueryDto extends createZodDto(NotificationListQuerySchema) {}
export class NotificationListDto extends createZodDto(NotificationListSchema) {}
export class MarkAllReadResultDto extends createZodDto(MarkAllReadResultSchema) {}
