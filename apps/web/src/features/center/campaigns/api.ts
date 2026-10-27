import {
  type Campaign,
  CampaignListSchema,
  CampaignSchema,
  type CreateCampaignRequest,
  type UpdateCampaignRequest,
} from '@srm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api/client';

// Campaign API hooks (US-1.4). Responses are parsed with the shared schemas, so the screens work
// with the same types as the API.

export const campaignKeys = {
  all: ['campaigns'] as const,
  detail: (id: number) => ['campaigns', id] as const,
};

export function useCampaigns() {
  return useQuery({
    queryKey: campaignKeys.all,
    queryFn: async () => CampaignListSchema.parse(unwrap(await api.GET('/api/campaigns'))).items,
  });
}

export function useCampaign(id: number) {
  return useQuery({
    queryKey: campaignKeys.detail(id),
    queryFn: async () =>
      CampaignSchema.parse(unwrap(await api.GET('/api/campaigns/{id}', { params: { path: { id } } }))),
  });
}

/** Keeps the detail cache in step and refreshes the list (its prefix covers every detail too). */
function useStoreCampaign() {
  const queryClient = useQueryClient();
  return (campaign: Campaign) => {
    queryClient.setQueryData(campaignKeys.detail(campaign.id), campaign);
    void queryClient.invalidateQueries({ queryKey: campaignKeys.all, exact: true });
  };
}

export function useCreateCampaign() {
  const store = useStoreCampaign();
  return useMutation({
    mutationFn: async (body: CreateCampaignRequest) =>
      CampaignSchema.parse(unwrap(await api.POST('/api/campaigns', { body }))),
    onSuccess: store,
  });
}

export function useUpdateCampaign(id: number) {
  const store = useStoreCampaign();
  return useMutation({
    mutationFn: async (body: UpdateCampaignRequest) =>
      CampaignSchema.parse(unwrap(await api.PATCH('/api/campaigns/{id}', { params: { path: { id } }, body }))),
    onSuccess: store,
  });
}

export function useOpenCampaign(id: number) {
  const store = useStoreCampaign();
  return useMutation({
    mutationFn: async (rowVersion: number) =>
      CampaignSchema.parse(
        unwrap(await api.POST('/api/campaigns/{id}/open', { params: { path: { id } }, body: { rowVersion } })),
      ),
    onSuccess: store,
  });
}
