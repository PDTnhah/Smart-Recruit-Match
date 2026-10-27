import {
  type AdminSkill,
  AdminSkillListSchema,
  AdminSkillSchema,
  type ApproveSkillRequest,
  CatalogSkillListSchema,
  type MergeSkillRequest,
  type SkillStatus,
} from '@srm/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api/client';

// API hooks of "Danh mục kỹ năng" in the admin portal (US-2.5 AC-7, CONTEXT D39). Responses are
// parsed with the shared schemas, so the screen uses the same types as the API.

export const skillKeys = {
  admin: ['skills', 'admin'] as const,
  adminList: (status: SkillStatus) => ['skills', 'admin', status] as const,
  catalog: (query: string, limit: number) => ['skills', 'catalog', query, limit] as const,
};

/** Skills by review status, oldest first (the API returns at most 500). */
export function useAdminSkills(status: SkillStatus) {
  return useQuery({
    queryKey: skillKeys.adminList(status),
    queryFn: async () =>
      AdminSkillListSchema.parse(unwrap(await api.GET('/api/admin/skills', { params: { query: { status } } }))).items,
  });
}

/** Approved skills whose name or alias contains `query`, the closest first; all of them by name when empty. */
export function useCatalogSkills(query: string, limit: number, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: skillKeys.catalog(query, limit),
    queryFn: async () => {
      const params = { query: query === '' ? { limit } : { query, limit } };
      return CatalogSkillListSchema.parse(unwrap(await api.GET('/api/skills', { params }))).items;
    },
    enabled: options.enabled,
    // Keeps the last results on screen while the next query loads.
    placeholderData: keepPreviousData,
  });
}

/** A decided skill leaves the pending list and joins another one: refetch every list. */
function useRefreshSkills() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['skills'] });
}

export function useApproveSkill(id: number) {
  const refresh = useRefreshSkills();
  return useMutation({
    mutationFn: async (body: ApproveSkillRequest): Promise<AdminSkill> =>
      AdminSkillSchema.parse(
        unwrap(await api.POST('/api/admin/skills/{id}/approve', { params: { path: { id } }, body })),
      ),
    onSuccess: refresh,
  });
}

export function useMergeSkill(id: number) {
  const refresh = useRefreshSkills();
  return useMutation({
    mutationFn: async (body: MergeSkillRequest): Promise<AdminSkill> =>
      AdminSkillSchema.parse(unwrap(await api.POST('/api/admin/skills/{id}/merge', { params: { path: { id } }, body }))),
    onSuccess: refresh,
  });
}

export function useRejectSkill(id: number) {
  const refresh = useRefreshSkills();
  return useMutation({
    mutationFn: async (rowVersion: number): Promise<AdminSkill> =>
      AdminSkillSchema.parse(
        unwrap(await api.POST('/api/admin/skills/{id}/reject', { params: { path: { id } }, body: { rowVersion } })),
      ),
    onSuccess: refresh,
  });
}
