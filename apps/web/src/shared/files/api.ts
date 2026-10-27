import { FileUrlSchema } from '@srm/shared';
import { api, unwrap } from '@/shared/api/client';

/** A presigned download URL valid 5 minutes; `id` is `jd:12`, `cv:457` (CONTEXT D28). */
export async function fetchFileUrl(id: string): Promise<string> {
  return FileUrlSchema.parse(unwrap(await api.GET('/api/files/{id}/url', { params: { path: { id } } }))).url;
}
