import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { ApiError } from '@srm/shared';
import { DomainError } from './domain-error.js';

/** The part of the Express response this filter uses (avoids a dependency on @types/express). */
interface JsonResponse {
  status(code: number): { json(body: unknown): unknown };
}

/**
 * Maps DomainError to its HTTP status with a body matching the shared ApiErrorSchema. Outside HTTP
 * (e.g. RabbitMQ consumers, AD-5) the error is rethrown so the caller sees the original domain error.
 */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter<DomainError> {
  catch(error: DomainError, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw error;
    host.switchToHttp().getResponse<JsonResponse>().status(error.httpStatus).json(domainErrorBody(error));
  }
}

export function domainErrorBody(error: DomainError): ApiError {
  return {
    code: error.code,
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
  };
}
