import { z } from 'zod';

// Uploaded files (CV, JD) and their temporary download URLs (ARCHITECTURE › Lưu trữ file, CONTEXT D28).

/** Largest file the API accepts (ARCHITECTURE › Security architecture › Tải file). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Lifetime of a presigned download URL: 5 minutes. */
export const FILE_URL_TTL_SECONDS = 5 * 60;

/** Owners of stored files. `cv` joins in US-1.6. */
export const FILE_OWNER_TYPES = ['jd', 'cv'] as const;

export type FileOwnerType = (typeof FILE_OWNER_TYPES)[number];

/** `{id}` of `GET /api/files/{id}/url`: `<owner>:<record id>`, e.g. `jd:12` (CONTEXT D28). */
export const FileIdSchema = z.string().regex(/^(jd|cv):[1-9]\d{0,9}$/, { error: 'Mã file không hợp lệ' });

export function fileId(owner: FileOwnerType, id: number): string {
  return `${owner}:${id}`;
}

export const FileIdParamSchema = z.object({ id: FileIdSchema });

export const FileUrlSchema = z.object({
  url: z.url(),
  expiresAt: z.iso.datetime(),
});

export type FileUrl = z.output<typeof FileUrlSchema>;
