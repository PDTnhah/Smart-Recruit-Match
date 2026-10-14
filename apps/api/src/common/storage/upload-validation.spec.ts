import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PayloadTooLargeException } from '@nestjs/common';
import { lastValueFrom, throwError } from 'rxjs';
import { FileTooLargeError, UnsupportedFileTypeError, ValidationFailedError } from '../errors/index.js';
import { detectDocument, displayFileName, requireFile, UploadErrorsInterceptor } from './upload-validation.js';

const fixture = (name: string) => readFileSync(path.resolve(__dirname, '../../../test/fixtures/files', name));

describe('GĐ1: upload validation (ARCHITECTURE › Tải file)', () => {
  it('GĐ1: a real PDF is detected from its bytes', async () => {
    await expect(detectDocument(fixture('sample.pdf'))).resolves.toEqual({ ext: 'pdf', mime: 'application/pdf' });
  });

  it('GĐ1: a real DOCX is detected from its zip entries', async () => {
    await expect(detectDocument(fixture('sample.docx'))).resolves.toEqual({
      ext: 'docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  });

  it('GĐ1: text named .pdf is rejected with 415, whatever the name says', async () => {
    const error = await detectDocument(fixture('fake.pdf')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnsupportedFileTypeError);
    expect((error as UnsupportedFileTypeError).httpStatus).toBe(415);
  });

  it('GĐ1: a zip that is not a Word document is rejected', async () => {
    await expect(detectDocument(fixture('plain.zip'))).rejects.toMatchObject({
      code: 'UNSUPPORTED_FILE_TYPE',
      details: { detected: 'application/zip' },
    });
  });

  it('GĐ1: an empty buffer is rejected', async () => {
    await expect(detectDocument(Buffer.alloc(0))).rejects.toBeInstanceOf(UnsupportedFileTypeError);
  });

  it('GĐ1: the stored file name keeps Vietnamese text but drops paths and control characters', () => {
    expect(displayFileName('JD Thực tập sinh.pdf', 'pdf')).toBe('JD Thực tập sinh.pdf');
    expect(displayFileName(String.raw`C:\Users\hr\jd.docx`, 'docx')).toBe('jd.docx');
    expect(displayFileName('../../etc/passwd', 'pdf')).toBe('passwd');
    expect(displayFileName('a\u0000b\nc.pdf', 'pdf')).toBe('abc.pdf');
    expect(displayFileName('   ', 'pdf')).toBe('file.pdf');
    expect(displayFileName(`${'x'.repeat(300)}.pdf`, 'pdf')).toHaveLength(255);
  });

  it('GĐ1: a request without a file part answers 400 on the `file` field', () => {
    expect(() => requireFile(undefined)).toThrow(ValidationFailedError);
  });

  it("GĐ1: multer's size-limit error becomes FILE_TOO_LARGE (413)", async () => {
    const interceptor = new UploadErrorsInterceptor();
    const failing = { handle: () => throwError(() => new PayloadTooLargeException('File too large')) };
    const error = await lastValueFrom(interceptor.intercept({} as never, failing)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FileTooLargeError);
    expect((error as FileTooLargeError).httpStatus).toBe(413);
  });

  it('GĐ1: other errors pass through unchanged', async () => {
    const interceptor = new UploadErrorsInterceptor();
    const original = new Error('boom');
    const failing = { handle: () => throwError(() => original) };
    await expect(lastValueFrom(interceptor.intercept({} as never, failing))).rejects.toBe(original);
  });
});
