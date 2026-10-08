import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // postgres://user:password@host:port/db — the password must be URL-safe (DEPLOY.md).
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // Refresh tokens live here (CONTEXT D25).
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  // HS256 key for access tokens; at least 32 characters (CONTEXT D25). A copied example value
  // would let anyone forge tokens, so placeholders are refused.
  JWT_ACCESS_SECRET: z
    .string()
    .min(32)
    .refine((value) => !value.startsWith('change-me'), {
      error: 'still the example placeholder; generate one with `openssl rand -base64 48`',
    }),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
});

export type Env = z.infer<typeof EnvSchema>;

/** Parses process.env once at startup; an invalid value stops the process with a readable error. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
