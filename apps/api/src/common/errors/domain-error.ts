import type { ApiErrorCode } from '@srm/shared';

// Plain classes without NestJS imports, so domain/ code may throw them too.
// DomainErrorFilter turns them into `{ code, message, details }` responses.

export abstract class DomainError extends Error {
  abstract readonly code: ApiErrorCode;
  abstract readonly httpStatus: number;

  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The state table has no edge from the current state to the requested one (AD-8). */
export class InvalidTransitionError extends DomainError {
  readonly code = 'INVALID_TRANSITION';
  readonly httpStatus = 422;

  constructor(entity: string, from: string, to: string) {
    super(`${entity}: transition ${from} -> ${to} is not allowed`, { entity, from, to });
  }
}

/** The edge exists but a business condition (guard) does not hold; `reasonCode` says which. */
export class TransitionConditionFailedError extends DomainError {
  readonly code = 'TRANSITION_CONDITION_FAILED';
  readonly httpStatus = 422;

  constructor(entity: string, from: string, to: string, reasonCode: string, message?: string) {
    super(message ?? `${entity}: condition ${reasonCode} not met for ${from} -> ${to}`, {
      entity,
      from,
      to,
      reasonCode,
    });
  }
}

/** Someone else changed the row since the caller read it (optimistic lock on row_version). */
export class RowVersionConflictError extends DomainError {
  readonly code = 'ROW_VERSION_CONFLICT';
  readonly httpStatus = 409;

  constructor(entity: string, id: number, expected: number, actual?: number) {
    super(`${entity} ${id} was modified concurrently (expected row_version ${expected})`, {
      entity,
      id,
      expectedRowVersion: expected,
      ...(actual === undefined ? {} : { actualRowVersion: actual }),
    });
  }
}

export class EntityNotFoundError extends DomainError {
  readonly code = 'ENTITY_NOT_FOUND';
  readonly httpStatus = 404;

  constructor(entity: string, id: number) {
    super(`${entity} ${id} not found`, { entity, id });
  }
}
