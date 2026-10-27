import { BadRequestException, Controller, Get, type INestApplication, Param } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ApiErrorSchema } from '@srm/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ApiExceptionFilter } from './api-exception.filter.js';
import { ForbiddenError } from './domain-error.js';

@Controller('throw')
class ThrowingController {
  @Get(':kind')
  throw(@Param('kind') kind: string): never {
    switch (kind) {
      case 'domain':
        throw new ForbiddenError();
      case 'http':
        throw new BadRequestException('Unexpected token in JSON');
      default:
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
    }
  }
}

describe('ApiExceptionFilter: every error body matches ApiErrorSchema (US-1.3)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ThrowingController],
      providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps the code and status of a domain error', async () => {
    const res = await request(app.getHttpServer()).get('/throw/domain').expect(403);
    expect(ApiErrorSchema.parse(res.body)).toEqual({ code: 'FORBIDDEN', message: 'Forbidden' });
  });

  it('maps Nest HttpExceptions and unknown routes to HTTP_<status>', async () => {
    const bad = await request(app.getHttpServer()).get('/throw/http').expect(400);
    expect(ApiErrorSchema.parse(bad.body)).toEqual({ code: 'HTTP_400', message: 'Unexpected token in JSON' });
    const missing = await request(app.getHttpServer()).get('/nowhere').expect(404);
    expect(ApiErrorSchema.parse(missing.body).code).toBe('HTTP_404');
  });

  it('answers any other error with a bare 500 that leaks nothing', async () => {
    const res = await request(app.getHttpServer()).get('/throw/unknown').expect(500);
    expect(ApiErrorSchema.parse(res.body)).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  });
});
