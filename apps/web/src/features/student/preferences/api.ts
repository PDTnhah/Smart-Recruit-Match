import {
  type CompetitionUpdatedEvent,
  CompetitionUpdatedEventSchema,
  isLowCompetitionSuggestion,
  type PreferenceList,
  PreferenceListSchema,
  type ReplacePreferencesRequest,
  SERVER_EVENTS,
  type ShortlistResponse,
  ShortlistResponseSchema,
} from '@srm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api/client';
import { useServerEvent } from '@/shared/notifications/server-events';

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

/** The shortlist with the levels of a `competition.updated` event; unchanged when none applies. */
function withCompetition(view: ShortlistResponse, event: CompetitionUpdatedEvent): ShortlistResponse {
  if (view.campaign?.id !== event.campaignId) return view;
  const levels = new Map(event.items.map(({ jdId, ...competition }) => [jdId, competition]));
  if (!view.items.some((item) => levels.has(item.jd.id))) return view;
  return {
    ...view,
    items: view.items.map((item) => {
      const competition = levels.get(item.jd.id);
      return competition
        ? { ...item, competition, lowCompetitionSuggestion: isLowCompetitionSuggestion(competition) }
        : item;
    }),
  };
}

/**
 * Keeps the competition levels of the shortlist current (US-3.4 AC-3, AC-8): a `competition.updated`
 * event patches the cached shortlist in place, without a request. `ready` (the stream opened or came
 * back) reads the shortlist again, so a change made while the stream was down is not missed; a
 * request already running is reused rather than restarted.
 */
export function useCompetitionUpdates() {
  const queryClient = useQueryClient();
  useServerEvent(SERVER_EVENTS.COMPETITION_UPDATED, (data) => {
    const event = CompetitionUpdatedEventSchema.safeParse(data);
    if (!event.success) return;
    queryClient.setQueryData<ShortlistResponse>(preferenceKeys.shortlist, (view) => view && withCompetition(view, event.data));
    // A request already running may have read the counts before this change and would undo the
    // patch when it lands: start it again, so it reads them after.
    if (queryClient.isFetching({ queryKey: preferenceKeys.shortlist }) > 0) {
      void queryClient.invalidateQueries({ queryKey: preferenceKeys.shortlist });
    }
  });
  useServerEvent(SERVER_EVENTS.READY, () => {
    void queryClient.invalidateQueries({ queryKey: preferenceKeys.shortlist }, { cancelRefetch: false });
  });
}
