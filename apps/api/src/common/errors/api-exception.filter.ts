import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { ApiError } from '@srm/shared';
import { DomainError } from './domain-error.js';
import { domainErrorBody } from './domain-error.filter.js';

/** The part of the Express response this filter uses (avoids a dependency on @types/express). */
interface JsonResponse {
  status(code: number): { json(body: unknown): unknown };
}

/**
 * The app's only exception filter, so every HTTP error body matches ApiErrorSchema (CONTEXT D25):
 * domain errors keep their code; Nest's HttpExceptions (unknown route, malformed JSON) become
 * `HTTP_<status>`; anything else is logged and answered with a bare 500 INTERNAL_ERROR.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;
    const response = host.switchToHttp().getResponse<JsonResponse>();
    if (exception instanceof DomainError) {
      response.status(exception.httpStatus).json(domainErrorBody(exception));
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) this.logger.error(exception);
      const body: ApiError = { code: `HTTP_${status}`, message: exception.message };
      response.status(status).json(body);
      return;
    }
    // Details stay in the log; the client never sees internal messages or stack traces.
    this.logger.error(exception);
    const body: ApiError = { code: 'INTERNAL_ERROR', message: 'Internal server error' };
    response.status(500).json(body);
  }
}
