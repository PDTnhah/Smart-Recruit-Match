import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';
import { createZodValidationPipe } from 'nestjs-zod';
import { ZodError } from 'zod';
import { ValidationFailedError } from '../errors/index.js';

function toValidationFailed(error: unknown): Error {
  if (!(error instanceof ZodError)) return error instanceof Error ? error : new Error(String(error));
  return new ValidationFailedError(
    error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  );
}

// strictSchemaDeclaration: a body, query or params argument not typed with a Zod DTO is a server
// error, so a forgotten DTO (or an `import type` that erases it) cannot skip validation.
const StrictZodValidationPipe = createZodValidationPipe({
  createValidationException: toValidationFailed,
  strictSchemaDeclaration: true,
});

/** Global pipe: validates every request input with its nestjs-zod DTO. */
@Injectable()
export class ZodRequestValidationPipe implements PipeTransform {
  private readonly zod: PipeTransform = new StrictZodValidationPipe();

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    // Custom parameter decorators such as @CurrentUser() carry server-side values, not input.
    return metadata.type === 'custom' ? value : this.zod.transform(value, metadata);
  }
}
