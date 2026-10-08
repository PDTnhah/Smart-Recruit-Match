import { z } from 'zod';

/** Global route prefix of the Core Backend; the web client builds API URLs from it. */
export const API_PREFIX = 'api';

/** Body of `GET /api/health` (shape produced by @nestjs/terminus). */
export const HealthCheckSchema = z.object({
  status: z.enum(['ok', 'error', 'shutting_down']),
  info: z.record(z.string(), z.unknown()).optional(),
  error: z.record(z.string(), z.unknown()).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type HealthCheck = z.infer<typeof HealthCheckSchema>;
