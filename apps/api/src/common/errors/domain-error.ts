import type { ApiErrorCode } from '@srm/shared';

// Plain classes without NestJS imports, so domain/ code may throw them too.
// ApiExceptionFilter (or DomainErrorFilter) turns them into `{ code, message, details }` responses.

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

// Authentication, authorization and validation (US-1.3, CONTEXT D25).

/** No access token, or the token is malformed, expired or signed with another key. */
export class UnauthenticatedError extends DomainError {
  readonly code = 'UNAUTHENTICATED';
  readonly httpStatus = 401;

  constructor(message = 'Authentication required') {
    super(message);
  }
}

/** Login failed. Unknown email and wrong password share this error so neither leaks (AC-2). */
export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';
  readonly httpStatus = 401;

  constructor() {
    super('Invalid email or password');
  }
}

/** The caller's role is not allowed on this route. Out-of-scope records use EntityNotFoundError. */
export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly httpStatus = 403;

  constructor(message = 'Forbidden') {
    super(message);
  }
}

export interface ValidationIssue {
  path: string;
  message: string;
}

/** Request body, query or params failed its Zod schema. Details never echo the submitted values. */
export class ValidationFailedError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
  readonly httpStatus = 400;

  constructor(issues: ValidationIssue[]) {
    super('Request validation failed', { issues });
  }
}

export class EmailTakenError extends DomainError {
  readonly code = 'EMAIL_TAKEN';
  readonly httpStatus = 409;

  constructor() {
    super('An account with this email already exists');
  }
}

export class StudentCodeTakenError extends DomainError {
  readonly code = 'STUDENT_CODE_TAKEN';
  readonly httpStatus = 409;

  constructor() {
    super('A student with this student code already exists');
  }
}

/** The request is well-formed but this role cannot be created this way (HR joins by invitation). */
export class RoleNotAllowedError extends DomainError {
  readonly code = 'ROLE_NOT_ALLOWED';
  readonly httpStatus = 422;

  constructor(role: string, message: string) {
    super(message, { role });
  }
}
