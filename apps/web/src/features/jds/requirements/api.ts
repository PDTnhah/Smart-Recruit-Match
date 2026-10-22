import { type JdRequirementsView, JdRequirementsViewSchema, type SaveJdRequirementsRequest } from '@srm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api/client';
import { jdKeys } from '../api';

// Normalised requirements of a JD (US-2.3): HR reviews, edits and confirms them; the center reads
// them and versions an approved JD. Responses are parsed with the shared schema.

export const requirementsKey = (id: number) => [...jdKeys.all, 'requirements', id] as const;

export function useJdRequirements(id: number) {
  return useQuery({
    queryKey: requirementsKey(id),
    queryFn: async () =>
      JdRequirementsViewSchema.parse(unwrap(await api.GET('/api/jds/{id}/requirements', { params: { path: { id } } }))),
  });
}

/** After a save or confirmation: the view is stored, and the JD (status, version) is read again. */
function useStoreRequirements(id: number) {
  const queryClient = useQueryClient();
  return (view: JdRequirementsView) => {
    queryClient.setQueryData(requirementsKey(id), view);
    void queryClient.invalidateQueries({ queryKey: jdKeys.detail(id) });
    void queryClient.invalidateQueries({ queryKey: [...jdKeys.all, 'list'] });
  };
}

/** `PUT /api/jds/{id}/requirements`: in place before confirmation, version + 1 once approved. */
export function useSaveJdRequirements(id: number) {
  const store = useStoreRequirements(id);
  return useMutation({
    mutationFn: async (body: SaveJdRequirementsRequest) =>
      JdRequirementsViewSchema.parse(
        unwrap(await api.PUT('/api/jds/{id}/requirements', { params: { path: { id } }, body })),
      ),
    onSuccess: store,
  });
}

/** `PUT /api/jds/{id}/requirements/confirm`: the JD moves to "Chờ Trung tâm duyệt" (AC-8). */
export function useConfirmJdRequirements(id: number) {
  const store = useStoreRequirements(id);
  return useMutation({
    mutationFn: async (body: SaveJdRequirementsRequest) =>
      JdRequirementsViewSchema.parse(
        unwrap(await api.PUT('/api/jds/{id}/requirements/confirm', { params: { path: { id } }, body })),
      ),
    onSuccess: store,
  });
}

/** The JD and its requirements, read again when the analysis settles (SSE `jd.analysis`). */
export function useRefreshJd() {
  const queryClient = useQueryClient();
  return (id: number) => {
    void queryClient.invalidateQueries({ queryKey: jdKeys.detail(id) });
    void queryClient.invalidateQueries({ queryKey: requirementsKey(id) });
    void queryClient.invalidateQueries({ queryKey: [...jdKeys.all, 'list'] });
  };
}
