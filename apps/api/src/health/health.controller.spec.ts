import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { API_PREFIX, HealthCheckSchema } from '@srm/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { HealthModule } from './health.module.js';

describe('GET /api/health (US-1.1 AC-2)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [HealthModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with a body matching the shared HealthCheckSchema', async () => {
    const res = await request(app.getHttpServer()).get(`/${API_PREFIX}/health`).expect(200);
    expect(HealthCheckSchema.parse(res.body).status).toBe('ok');
  });
});
