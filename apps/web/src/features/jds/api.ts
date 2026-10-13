import {
  type CreateJdRequest,
  fileId,
  FileUrlSchema,
  JdListSchema,
  type JobDescription,
  JobDescriptionSchema,
  type JobDescriptionStatus,
  type UpdateJdRequest,
} from '@srm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api/client';

// JD API hooks shared by the HR portal ("JD của tôi") and the center ("Duyệt JD"), US-1.5.
// Responses are parsed with the shared schemas, so screens use the same types as the API.

export interface JdFilter {
  campaignId?: number;
  status?: JobDescriptionStatus;
}

export const jdKeys = {
  all: ['jds'] as const,
  list: (filter: JdFilter) => ['jds', 'list', filter] as const,
  detail: (id: number) => ['jds', 'detail', id] as const,
};

/** HR gets its own company's JDs, the center every JD (the API applies the scope). */
export function useJds(filter: JdFilter = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: jdKeys.list(filter),
    queryFn: async () =>
      JdListSchema.parse(unwrap(await api.GET('/api/jds', { params: { query: filter } }))).items,
    enabled: options.enabled,
  });
}

export function useJd(id: number) {
  return useQuery({
    queryKey: jdKeys.detail(id),
    queryFn: async () => JobDescriptionSchema.parse(unwrap(await api.GET('/api/jds/{id}', { params: { path: { id } } }))),
  });
}

/** Keeps the detail cache in step and refreshes every list. */
function useStoreJd() {
  const queryClient = useQueryClient();
  return (jd: JobDescription) => {
    queryClient.setQueryData(jdKeys.detail(jd.id), jd);
    void queryClient.invalidateQueries({ queryKey: [...jdKeys.all, 'list'] });
  };
}

export function useCreateJd() {
  const store = useStoreJd();
  return useMutation({
    mutationFn: async (body: CreateJdRequest) => JobDescriptionSchema.parse(unwrap(await api.POST('/api/jds', { body }))),
    onSuccess: store,
  });
}

export function useUpdateJd(id: number) {
  const store = useStoreJd();
  return useMutation({
    mutationFn: async (body: UpdateJdRequest) =>
      JobDescriptionSchema.parse(unwrap(await api.PATCH('/api/jds/{id}', { params: { path: { id } }, body }))),
    onSuccess: store,
  });
}

/**
 * `PUT /api/jds/{id}/file` as multipart (AC-5); the browser sets the boundary. The JD id is a
 * variable, not a hook argument: a new JD gets its file right after it is created.
 */
export function useUploadJdFile() {
  const store = useStoreJd();
  return useMutation({
    mutationFn: async ({ jdId, file, rowVersion }: { jdId: number; file: File; rowVersion: number }) =>
      JobDescriptionSchema.parse(
        unwrap(
          await api.PUT('/api/jds/{id}/file', {
            params: { path: { id: jdId } },
            // openapi-typescript types a binary part as string; the serializer sends the File itself.
            body: { file: file as unknown as string, rowVersion },
            bodySerializer: () => {
              const form = new FormData();
              form.append('rowVersion', String(rowVersion));
              form.append('file', file);
              return form;
            },
          }),
        ),
      ),
    onSuccess: store,
  });
}

export function useSubmitJd(id: number) {
  const store = useStoreJd();
  return useMutation({
    mutationFn: async (rowVersion: number) =>
      JobDescriptionSchema.parse(
        unwrap(await api.POST('/api/jds/{id}/submit', { params: { path: { id } }, body: { rowVersion } })),
      ),
    onSuccess: store,
  });
}

export function useApproveJd(id: number) {
  const store = useStoreJd();
  return useMutation({
    mutationFn: async (rowVersion: number) =>
      JobDescriptionSchema.parse(
        unwrap(await api.POST('/api/jds/{id}/approve', { params: { path: { id } }, body: { rowVersion } })),
      ),
    onSuccess: store,
  });
}

/** A presigned download URL of the JD's original file, valid 5 minutes (AC-9). */
export async function fetchJdFileUrl(jdId: number): Promise<string> {
  const result = await api.GET('/api/files/{id}/url', { params: { path: { id: fileId('jd', jdId) } } });
  return FileUrlSchema.parse(unwrap(result)).url;
}
