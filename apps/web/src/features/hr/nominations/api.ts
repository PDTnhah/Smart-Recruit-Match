import {
  type HrDecisionRequest,
  HrDecisionResultSchema,
  JdNominationListSchema,
  NominationDetailSchema,
  SupplementRequestSchema,
} from '@srm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api/client';

// API hooks of "Đề cử" in the HR portal (US-5.3). Responses are parsed with the shared schemas, so
// the screens use the same types as the API.

export const nominationKeys = {
  all: ['nominations'] as const,
  jd: (jdId: number) => ['nominations', 'jd', jdId] as const,
  detail: (id: number) => ['nominations', 'detail', id] as const,
};

/** AC-1: the JD's nominations of published rounds, best S_final first. */
export function useJdNominations(jdId: number) {
  return useQuery({
    queryKey: nominationKeys.jd(jdId),
    queryFn: async () =>
      JdNominationListSchema.parse(unwrap(await api.GET('/api/jds/{id}/nominations', { params: { path: { id: jdId } } }))),
  });
}

/** AC-2: one nomination with its evidence; nothing is read until one is open. */
export function useNomination(id: number | null) {
  return useQuery({
    queryKey: nominationKeys.detail(id ?? 0),
    enabled: id !== null,
    queryFn: async () =>
      NominationDetailSchema.parse(unwrap(await api.GET('/api/nominations/{id}', { params: { path: { id: id! } } }))),
  });
}

/**
 * AC-5, AC-6: invite or reject at the row version the sheet was opened with (LESSONS §25). Success
 * or a 409 (another HR decided first) reloads the list and the detail.
 */
export function useDecideNomination(jdId: number, nominationId: number) {
  const queryClient = useQueryClient();
  const reload = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: nominationKeys.jd(jdId) }),
      queryClient.invalidateQueries({ queryKey: nominationKeys.detail(nominationId) }),
    ]);
  return useMutation({
    mutationFn: async (body: HrDecisionRequest) =>
      HrDecisionResultSchema.parse(
        unwrap(await api.POST('/api/nominations/{id}/decision', { params: { path: { id: nominationId } }, body })),
      ),
    onSettled: reload,
  });
}

/** AC-9: ask the center for more candidates for the JD. */
export function useRequestSupplement(jdId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (note: string) =>
      SupplementRequestSchema.parse(
        unwrap(await api.POST('/api/jds/{id}/supplement-requests', { params: { path: { id: jdId } }, body: { note } })),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: nominationKeys.jd(jdId) }),
  });
}
