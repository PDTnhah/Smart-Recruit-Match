import { MyAllocationResultsSchema } from '@srm/shared';
import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api/client';

/** The student's published allocation results, newest round first (US-5.2 AC-12). */
export function useMyAllocationResults() {
  return useQuery({
    queryKey: ['me', 'allocation-results'] as const,
    queryFn: async () => MyAllocationResultsSchema.parse(unwrap(await api.GET('/api/me/allocation-results'))).items,
  });
}
