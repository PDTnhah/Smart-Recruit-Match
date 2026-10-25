import { CenterCvListSchema } from '@srm/shared';
import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api/client';

// API hooks of "CV cần xử lý" in the center portal (US-2.4 AC-11). Responses are parsed with the
// shared schemas, so the screen uses the same types as the API.

export interface CenterCvFilter {
  campaignId?: number;
  /** CVs whose analysis failed or whose file hid text. */
  attention?: boolean;
}

export const centerCvKeys = {
  list: (filter: CenterCvFilter) => ['cvs', 'center', filter] as const,
};

export function useCenterCvs(filter: CenterCvFilter) {
  return useQuery({
    queryKey: centerCvKeys.list(filter),
    queryFn: async () => {
      const query = {
        ...(filter.campaignId === undefined ? {} : { campaignId: filter.campaignId }),
        ...(filter.attention ? { attention: 'true' as const } : {}),
        limit: 500,
      };
      return CenterCvListSchema.parse(unwrap(await api.GET('/api/cvs', { params: { query } }))).items;
    },
  });
}
