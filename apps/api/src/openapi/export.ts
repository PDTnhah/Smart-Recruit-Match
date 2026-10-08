// Writes the API's OpenAPI document to apps/web/src/shared/api/openapi.json, from which the web
// client types are generated (US-1.3 TASK-1.3.7, CONTEXT D26). The app is built but never listens;
// pg and ioredis connect lazily, so no database or Redis is needed. CI checks the file is current.
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { buildOpenApiDocument, configureApp } from '../app.setup.js';

/** Same relative path from src/openapi (ts) and dist/openapi (built). */
export const OPENAPI_OUTPUT = path.resolve(__dirname, '../../../web/src/shared/api/openapi.json');

// Placeholders only satisfy the env schema; nothing connects with them.
const PLACEHOLDER_ENV: Record<string, string> = {
  DATABASE_URL: 'postgres://openapi:openapi@localhost:5432/openapi',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'openapi-export-placeholder-secret-0000000',
  LOG_LEVEL: 'silent',
};

async function exportOpenApi(): Promise<void> {
  for (const [name, value] of Object.entries(PLACEHOLDER_ENV)) process.env[name] ??= value;
  const app = await NestFactory.create(AppModule, { logger: false });
  // 'production' skips the Swagger UI; only the global prefix matters here.
  configureApp(app, { NODE_ENV: 'production' });
  writeFileSync(OPENAPI_OUTPUT, `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`);
  await app.close();
}

exportOpenApi().then(
  () => console.log(`openapi: wrote ${OPENAPI_OUTPUT}`),
  (error: unknown) => {
    console.error('openapi: export failed', error);
    process.exit(1);
  },
);
