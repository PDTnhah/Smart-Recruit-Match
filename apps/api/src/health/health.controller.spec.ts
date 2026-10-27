import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { API_PREFIX, HealthCheckSchema } from '@srm/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DbModule } from '../db/db.module.js';
import { PG_POOL } from '../db/tokens.js';
import { HealthModule } from './health.module.js';

/** Stands in for pg.Pool: only the calls the health check and DbModule make. */
function fakePool(query: () => Promise<unknown>) {
  return { query, end: () => Promise.resolve(), on: () => undefined };
}

async function createApp(pool: ReturnType<typeof fakePool>): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [DbModule, HealthModule] })
    .overrideProvider(PG_POOL)
    .useValue(pool)
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({ logger: false });
  app.setGlobalPrefix(API_PREFIX);
  await app.init();
  return app;
}

describe('GET /api/health (US-1.1 AC-2, US-1.2 database indicator)', () => {
  let app: INestApplication<App> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('returns 200 with the database up when SELECT 1 succeeds', async () => {
    app = await createApp(fakePool(() => Promise.resolve({ rows: [{ '?column?': 1 }] })));
    const res = await request(app.getHttpServer()).get(`/${API_PREFIX}/health`).expect(200);
    const body = HealthCheckSchema.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.info).toEqual({ database: { status: 'up' } });
  });

  it('returns 503 with a generic message when the database is unreachable', async () => {
    app = await createApp(fakePool(() => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432'))));
    const res = await request(app.getHttpServer()).get(`/${API_PREFIX}/health`).expect(503);
    const body = HealthCheckSchema.parse(res.body);
    expect(body.status).toBe('error');
    expect(body.error).toEqual({ database: { status: 'down', message: 'database unreachable' } });
  });
});
