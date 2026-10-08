import { type ArgumentsHost, Controller, Get, type INestApplication, Param } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ApiErrorSchema } from '@srm/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  EntityNotFoundError,
  InvalidTransitionError,
  RowVersionConflictError,
  TransitionConditionFailedError,
} from './domain-error.js';
import { DomainErrorFilter } from './domain-error.filter.js';

@Controller('throw')
class ThrowingController {
  @Get(':kind')
  throw(@Param('kind') kind: string): never {
    switch (kind) {
      case 'invalid':
        throw new InvalidTransitionError('campaign', 'DRAFT', 'CLOSED');
      case 'condition':
        throw new TransitionConditionFailedError('campaign', 'DRAFT', 'INTAKE', 'MISSING_DEADLINES');
      case 'conflict':
        throw new RowVersionConflictError('campaign', 7, 3, 4);
      default:
        throw new EntityNotFoundError('campaign', 7);
    }
  }
}

describe('DomainErrorFilter maps domain errors to HTTP (US-1.2 AC-4, AC-5, AC-6)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ThrowingController],
      providers: [{ provide: APP_FILTER, useClass: DomainErrorFilter }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('AD-8: INVALID_TRANSITION returns 422 with the shared error body', async () => {
    const res = await request(app.getHttpServer()).get('/throw/invalid').expect(422);
    expect(ApiErrorSchema.parse(res.body)).toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { entity: 'campaign', from: 'DRAFT', to: 'CLOSED' },
    });
  });

  it('AD-8: TRANSITION_CONDITION_FAILED returns 422 with the reason code', async () => {
    const res = await request(app.getHttpServer()).get('/throw/condition').expect(422);
    expect(ApiErrorSchema.parse(res.body)).toMatchObject({
      code: 'TRANSITION_CONDITION_FAILED',
      details: { reasonCode: 'MISSING_DEADLINES' },
    });
  });

  it('AD-8: ROW_VERSION_CONFLICT returns 409', async () => {
    const res = await request(app.getHttpServer()).get('/throw/conflict').expect(409);
    expect(ApiErrorSchema.parse(res.body)).toMatchObject({
      code: 'ROW_VERSION_CONFLICT',
      details: { id: 7, expectedRowVersion: 3, actualRowVersion: 4 },
    });
  });

  it('ENTITY_NOT_FOUND returns 404', async () => {
    const res = await request(app.getHttpServer()).get('/throw/missing').expect(404);
    expect(ApiErrorSchema.parse(res.body).code).toBe('ENTITY_NOT_FOUND');
  });

  it('rethrows outside HTTP so non-HTTP callers (RabbitMQ consumers) get the domain error', () => {
    const error = new RowVersionConflictError('cv', 1, 0);
    const host = { getType: () => 'rmq' } as unknown as ArgumentsHost;
    expect(() => new DomainErrorFilter().catch(error, host)).toThrow(error);
  });
});
