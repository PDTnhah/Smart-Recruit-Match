import {
  type AdjustNominationsRequest,
  AllocationExplanationSchema,
  AllocationRoundListSchema,
  type AllocationRoundView,
  AllocationRoundViewSchema,
  type ReviewDeadlineExtensionRequest,
  ReviewDeadlineListSchema,
  ReviewDeadlineSchema,
} from '@srm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api/client';

// API hooks of "Phân bổ" in the center portal (US-5.2). Responses are parsed with the shared
// schemas, so the screen uses the same types as the API.

export const allocationKeys = {
  all: ['allocation'] as const,
  rounds: (campaignId: number) => ['allocation', 'rounds', campaignId] as const,
  round: (roundId: number) => ['allocation', 'round', roundId] as const,
  explanation: (roundId: number, studentId: number) => ['allocation', 'explanation', roundId, studentId] as const,
  deadlines: (roundId: number) => ['allocation', 'review-deadlines', roundId] as const,
};

/** The campaign's rounds, round 1 first. */
export function useAllocationRounds(campaignId: number | null) {
  return useQuery({
    queryKey: allocationKeys.rounds(campaignId ?? 0),
    enabled: campaignId !== null,
    queryFn: async () =>
      AllocationRoundListSchema.parse(
        unwrap(await api.GET('/api/campaigns/{id}/allocation-rounds', { params: { path: { id: campaignId! } } })),
      ).items,
  });
}

export function useAllocationRound(roundId: number | null) {
  return useQuery({
    queryKey: allocationKeys.round(roundId ?? 0),
    enabled: roundId !== null,
    queryFn: async () =>
      AllocationRoundViewSchema.parse(
        unwrap(await api.GET('/api/allocation-rounds/{id}', { params: { path: { id: roundId! } } })),
      ),
  });
}

/** Every write answers with the round as it now stands: show it at once, reload the list. */
function useRoundWrite<T>(campaignId: number, write: (input: T) => Promise<AllocationRoundView>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: (view) => {
      queryClient.setQueryData(allocationKeys.round(view.id), view);
      void queryClient.invalidateQueries({ queryKey: allocationKeys.rounds(campaignId) });
      void queryClient.invalidateQueries({ queryKey: ['allocation', 'explanation', view.id] });
    },
    // A 409 means the draft moved on (another staff member, a publish): show the current one.
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: allocationKeys.all });
    },
  });
}

/**
 * Runs round 1, or runs a draft again (its adjustments are replaced). `rowVersion` is the draft's as
 * the screen shows it, null when it shows none: a draft changed since is refused with a 409.
 */
export function useRunAllocation(campaignId: number) {
  return useRoundWrite(campaignId, async (rowVersion: number | null) =>
    AllocationRoundViewSchema.parse(
      unwrap(
        await api.POST('/api/campaigns/{id}/allocation-rounds', { params: { path: { id: campaignId } }, body: { rowVersion } }),
      ),
    ),
  );
}

export function useAdjustNominations(campaignId: number, roundId: number) {
  return useRoundWrite(campaignId, async (body: AdjustNominationsRequest) =>
    AllocationRoundViewSchema.parse(
      unwrap(await api.PATCH('/api/allocation-rounds/{id}/nominations', { params: { path: { id: roundId } }, body })),
    ),
  );
}

export function usePublishRound(campaignId: number, roundId: number) {
  return useRoundWrite(campaignId, async (rowVersion: number) =>
    AllocationRoundViewSchema.parse(
      unwrap(
        await api.POST('/api/allocation-rounds/{id}/publish', { params: { path: { id: roundId } }, body: { rowVersion } }),
      ),
    ),
  );
}

/** NFR-4: why a student is not at the JDs they ranked higher, with the figures behind it. */
export function useAllocationExplanation(roundId: number, studentId: number | null) {
  return useQuery({
    queryKey: allocationKeys.explanation(roundId, studentId ?? 0),
    enabled: studentId !== null,
    queryFn: async () =>
      AllocationExplanationSchema.parse(
        unwrap(
          await api.GET('/api/allocation-rounds/{id}/students/{studentId}/explanation', {
            params: { path: { id: roundId, studentId: studentId! } },
          }),
        ),
      ),
  });
}

/** HR's deadline for each JD of a published round (US-5.3 AC-10). */
export function useReviewDeadlines(roundId: number) {
  return useQuery({
    queryKey: allocationKeys.deadlines(roundId),
    queryFn: async () =>
      ReviewDeadlineListSchema.parse(
        unwrap(await api.GET('/api/allocation-rounds/{id}/review-deadlines', { params: { path: { id: roundId } } })),
      ).items,
  });
}

/** AC-10: move one JD's deadline later, with a reason; the list is read again either way. */
export function useExtendReviewDeadline(roundId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ jdId, ...body }: Omit<ReviewDeadlineExtensionRequest, 'roundId'> & { jdId: number }) =>
      ReviewDeadlineSchema.parse(
        unwrap(
          await api.POST('/api/jds/{id}/review-deadline-extensions', {
            params: { path: { id: jdId } },
            body: { roundId, ...body },
          }),
        ),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: allocationKeys.deadlines(roundId) }),
  });
}
