import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX } from '@srm/shared';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import type { Env } from './common/config/env.js';

/** Settings shared by main.ts, the integration-test app and the OpenAPI export. */
export function configureApp(app: INestApplication, env: Pick<Env, 'NODE_ENV'>): void {
  app.setGlobalPrefix(API_PREFIX);
  if (env.NODE_ENV !== 'production') {
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, () => buildOpenApiDocument(app));
  }
}

/**
 * OpenAPI document generated from the nestjs-zod DTOs. The version is fixed so the exported file
 * only changes when the API does (US-1.3 TASK-1.3.7).
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Smart Recruit Match API')
    .setVersion('1')
    .addBearerAuth()
    .build();
  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
}
