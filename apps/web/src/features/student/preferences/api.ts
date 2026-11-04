import {
  type PreferenceList,
  PreferenceListSchema,
  type ReplacePreferencesRequest,
  type ShortlistResponse,
  ShortlistResponseSchema,
} from '@srm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api/client';

// API hooks of the student "Nguyện vọng" screen (US-3.3): the shortlist with its explanations and
// the saved preferences, and the replacement of the whole list. Parsed with the shared schemas.

export const preferenceKeys = {
  shortlist: ['me', 'shortlist'] as const,
};

/** How often the screen asks again while the campaign is still being scored (AC-4). */
const SCORING_REFETCH_MS = 30_000;

/** `GET /api/me/shortlist`: suggestions, ineligible JDs and saved preferences of the student. */
export function useShortlist() {
  return useQuery({
    queryKey: preferenceKeys.shortlist,
    queryFn: async () => ShortlistResponseSchema.parse(unwrap(await api.GET('/api/me/shortlist'))),
    refetchInterval: (query) => (query.state.data?.state === 'SCORING' ? SCORING_REFETCH_MS : false),
  });
}

/** The shortlist as it stands once `saved` is stored, so the screen shows the new order at once. */
function withPreferences(view: ShortlistResponse, saved: PreferenceList): ShortlistResponse {
  const ranks = new Map(saved.preferences.map((preference) => [preference.jdId, preference.rank]));
  return {
    ...view,
    preferences: saved.preferences,
    items: view.items.map((item) => ({ ...item, preferenceRank: ranks.get(item.jd.id) ?? null })),
  };
}

/** `PUT /api/me/preferences` (AC-5): the saved list replaces the old one; the shortlist is read again after. */
export function useReplacePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: ReplacePreferencesRequest): Promise<PreferenceList> =>
      PreferenceListSchema.parse(unwrap(await api.PUT('/api/me/preferences', { body }))),
    onSuccess: (saved) => {
      queryClient.setQueryData<ShortlistResponse>(preferenceKeys.shortlist, (view) => view && withPreferences(view, saved));
      return queryClient.invalidateQueries({ queryKey: preferenceKeys.shortlist });
    },
  });
}
