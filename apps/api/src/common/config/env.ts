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
  // Cron jobs such as the campaign phase scheduler (CONTEXT D27). Integration tests turn them off
  // and call `runOnce()` themselves.
  SCHEDULER_ENABLED: z.stringbool().default(true),
  // Object storage (CONTEXT D23, D28). Buckets are fixed (`jd-files`, `cv-files`) and created by the
  // API on first write. MINIO_PUBLIC_ENDPOINT is the address browsers use for presigned URLs; a
  // signature covers the host, so it must be signed for that host (default: MINIO_ENDPOINT).
  MINIO_ENDPOINT: z.url({ protocol: /^https?$/ }),
  MINIO_ACCESS_KEY: z.string().min(3),
  MINIO_SECRET_KEY: z.string().min(8),
  MINIO_PUBLIC_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
  // Address of the web app as users open it, without a trailing slash. Links in emails (HR
  // invitations, notifications) are built from it (US-1.7, CONTEXT D31).
  WEB_ORIGIN: z
    .url({ protocol: /^https?$/ })
    .refine((value) => !value.endsWith('/'), { error: 'no trailing slash, e.g. https://srm.example.edu' }),
  // Outgoing email through the outbox (CONTEXT D31). Defaults match Mailpit on the host (dev);
  // compose points SMTP_HOST at the mailpit service. Port 465 uses implicit TLS.
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(3).default('Smart Recruit Match <no-reply@srm.local>'),
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
