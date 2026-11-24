import { MyAllocationResultsSchema, MyNominationReviewsSchema } from '@srm/shared';
import { useQuery } from '@tanstack/react-query';
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
