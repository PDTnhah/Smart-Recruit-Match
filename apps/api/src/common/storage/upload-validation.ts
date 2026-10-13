import {
  applyDecorators,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  PayloadTooLargeException,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { MAX_UPLOAD_BYTES } from '@srm/shared';
import { fromBuffer } from 'file-type';
import { catchError, type Observable, throwError } from 'rxjs';
import { FileTooLargeError, UnsupportedFileTypeError, ValidationFailedError } from '../errors/index.js';

// Upload checks shared by JD (US-1.5) and CV (US-1.6) files (ARCHITECTURE › Security architecture ›
// Tải file, CONTEXT D28): the real type comes from the magic bytes, never from the name or the
// Content-Type the client sent, and the size limit stops multer before the whole file is read.

/** The part of multer's file object the API uses (memory storage: the content is in `buffer`). */
export interface UploadedFileLike {
  originalname: string;
  size: number;
  buffer: Buffer;
}

/** Types accepted for original JD and CV files. */
export const DOCUMENT_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

export type DocumentExtension = keyof typeof DOCUMENT_TYPES;

export interface DetectedDocument {
  ext: DocumentExtension;
  mime: (typeof DOCUMENT_TYPES)[DocumentExtension];
}

/** 415 unless the bytes are a PDF or a DOCX. file-type recognises DOCX by the `word/` zip entries. */
export async function detectDocument(buffer: Buffer): Promise<DetectedDocument> {
  const detected = await fromBuffer(buffer);
  if (detected?.ext === 'pdf' || detected?.ext === 'docx') {
    return { ext: detected.ext, mime: DOCUMENT_TYPES[detected.ext] };
  }
  throw new UnsupportedFileTypeError(Object.keys(DOCUMENT_TYPES), detected?.mime);
}

/**
 * The client-supplied name, safe to store and show: no directory part, no control characters, at
 * most 255 characters. Falls back to `file.<ext>`.
 */
export function displayFileName(originalName: string, ext: DocumentExtension): string {
  const base = originalName.split(/[/\\]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
  return cleaned === '' ? `file.${ext}` : cleaned;
}

/** 400 when the multipart body has no `file` part. */
export function requireFile(file: UploadedFileLike | undefined): UploadedFileLike {
  if (!file) throw new ValidationFailedError([{ path: 'file', message: 'Chọn một file PDF hoặc DOCX' }]);
  return file;
}

/** Turns multer's size-limit error (a Nest 413) into the API's FILE_TOO_LARGE domain error. */
@Injectable()
export class UploadErrorsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(
        catchError((error: unknown) =>
          throwError(() => (error instanceof PayloadTooLargeException ? new FileTooLargeError(MAX_UPLOAD_BYTES) : error)),
        ),
      );
  }
}

/**
 * One file in the multipart field `file` (≤ MAX_UPLOAD_BYTES, kept in memory) plus up to a few
 * text fields. `fields` documents the text fields for OpenAPI.
 */
export function SingleFileUpload(fields: Record<string, { type: 'integer' | 'string' }> = {}): MethodDecorator {
  return applyDecorators(
    // The error mapper wraps FileInterceptor, so it sees multer's errors.
    UseInterceptors(
      UploadErrorsInterceptor,
      FileInterceptor('file', {
        limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5, parts: 6 },
        // Browsers send UTF-8 file names; multer's default (latin1) garbles Vietnamese ones.
        defParamCharset: 'utf8',
      }),
    ),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: ['file', ...Object.keys(fields)],
        properties: { file: { type: 'string', format: 'binary' }, ...fields },
      },
    }),
  );
}
