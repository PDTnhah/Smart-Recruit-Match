import {
  type AcceptConsentRequest,
  API_PREFIX,
  ConsentListSchema,
  ConsentSchema,
  CvListSchema,
  CvSchema,
} from '@srm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api/client';
import { postFormWithProgress } from '@/shared/api/upload';

// API hooks of the student "Hồ sơ" screen (US-1.6): consent to the terms, CV versions, upload.
// Responses are parsed with the shared schemas, so the screen uses the same types as the API.

export const profileKeys = {
  consents: ['me', 'consents'] as const,
  cvs: ['cvs', 'me'] as const,
};

export function useConsents() {
  return useQuery({
    queryKey: profileKeys.consents,
    queryFn: async () => ConsentListSchema.parse(unwrap(await api.GET('/api/me/consents'))),
  });
}

export function useAcceptConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: AcceptConsentRequest) =>
      ConsentSchema.parse(unwrap(await api.POST('/api/me/consents', { body }))),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKeys.consents }),
  });
}

/** Every CV version of the student, newest first. */
export function useMyCvs() {
  return useQuery({
    queryKey: profileKeys.cvs,
    queryFn: async () => CvListSchema.parse(unwrap(await api.GET('/api/cvs/me'))).items,
  });
}

export interface SubmitCvInput {
  campaignId: number;
  file: File;
  /** Upload progress from 0 to 1. */
  onProgress: (fraction: number) => void;
}

/** `POST /api/cvs` as multipart, with upload progress (AC-9); the browser sets the boundary. */
export function useSubmitCv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, file, onProgress }: SubmitCvInput) => {
      const form = new FormData();
      form.append('campaignId', String(campaignId));
      form.append('file', file);
      return CvSchema.parse(await postFormWithProgress(`/${API_PREFIX}/cvs`, form, onProgress));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKeys.cvs }),
  });
}
