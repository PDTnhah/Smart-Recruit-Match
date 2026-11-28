import {
  InterviewViewSchema,
  MyAllocationResultsSchema,
  MyInterviewsSchema,
  MyNominationReviewsSchema,
  OfferAnswerResponseSchema,
} from '@srm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api/client';

/** The student's published allocation results, newest round first (US-5.2 AC-12). */
export function useMyAllocationResults() {
  return useQuery({
    queryKey: ['me', 'allocation-results'] as const,
    queryFn: async () => MyAllocationResultsSchema.parse(unwrap(await api.GET('/api/me/allocation-results'))).items,
  });
}

/** What HR decided on the student's own nominations, the reason as a catalogue code (US-5.3 AC-6). */
export function useMyNominationReviews() {
  return useQuery({
    queryKey: ['me', 'nomination-reviews'] as const,
    queryFn: async () => MyNominationReviewsSchema.parse(unwrap(await api.GET('/api/me/nomination-reviews'))).items,
  });
}

const myInterviewsKey = ['me', 'interviews'] as const;

/** The student's interviews and offers, by nomination (US-5.4 AC-12). */
export function useMyInterviews() {
  return useQuery({
    queryKey: myInterviewsKey,
    queryFn: async () => MyInterviewsSchema.parse(unwrap(await api.GET('/api/me/interviews'))).items,
  });
}

/** Every answer changes the nomination too, so both lists reload. */
function useReload() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: myInterviewsKey }),
      queryClient.invalidateQueries({ queryKey: ['me', 'allocation-results'] }),
    ]);
}

/** AC-2: confirm the time, at the row version the page read. */
export function useConfirmInterview(interviewId: number) {
  const reload = useReload();
  return useMutation({
    mutationFn: async (rowVersion: number) =>
      InterviewViewSchema.parse(
        unwrap(await api.POST('/api/interviews/{id}/confirm', { params: { path: { id: interviewId } }, body: { rowVersion } })),
      ),
    onSettled: reload,
  });
}

/** AC-2: ask once for another time, with the reason. */
export function useRequestReschedule(interviewId: number) {
  const reload = useReload();
  return useMutation({
    mutationFn: async (body: { rowVersion: number; note: string }) =>
      InterviewViewSchema.parse(
        unwrap(await api.POST('/api/interviews/{id}/reschedule-request', { params: { path: { id: interviewId } }, body })),
      ),
    onSettled: reload,
  });
}

/** AC-6, AC-7: accept or decline the offer before its deadline (the server decides it). */
export function useAnswerOffer(offerId: number) {
  const reload = useReload();
  return useMutation({
    mutationFn: async ({ answer, rowVersion }: { answer: 'accept' | 'decline'; rowVersion: number }) =>
      OfferAnswerResponseSchema.parse(
        unwrap(
          answer === 'accept'
            ? await api.POST('/api/offers/{id}/accept', { params: { path: { id: offerId } }, body: { rowVersion } })
            : await api.POST('/api/offers/{id}/decline', { params: { path: { id: offerId } }, body: { rowVersion } }),
        ),
      ),
    onSettled: reload,
  });
}
