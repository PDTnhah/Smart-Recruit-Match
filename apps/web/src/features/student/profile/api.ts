import {
  type AcceptConsentRequest,
  API_PREFIX,
  ConsentListSchema,
  ConsentSchema,
  CvListSchema,
  type CvProfileView,
  CvProfileViewSchema,
  CvSchema,
  type ReopenCvProfileRequest,
  type SaveCvProfileRequest,
} from '@srm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api/client';
import { postFormWithProgress } from '@/shared/api/upload';

// API hooks of the student "Hồ sơ" screen (US-1.6): consent to the terms, CV versions, upload,
// and the review of the profile read from the CV (US-2.6). Responses are parsed with the shared
// schemas, so the screen uses the same types as the API.

export const profileKeys = {
  consents: ['me', 'consents'] as const,
  cvs: ['cvs', 'me'] as const,
  /** Under `cvs`, so what refreshes the CV list (SSE `cv.analysis`, an upload) refreshes it too. */
  profile: (campaignId: number) => ['cvs', 'me', 'profile', campaignId] as const,
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

/** The profile of the CV that counts in the campaign (AC-1). */
export function useCvProfile(campaignId: number) {
  return useQuery({
    queryKey: profileKeys.profile(campaignId),
    queryFn: async () =>
      CvProfileViewSchema.parse(unwrap(await api.GET('/api/cvs/me/profile', { params: { query: { campaignId } } }))),
  });
}

/** After a save, confirmation or reopen: the view is stored and the versions (status) read again. */
function useStoreProfile() {
  const queryClient = useQueryClient();
  return (view: CvProfileView) => {
    queryClient.setQueryData(profileKeys.profile(view.campaignId), view);
    void queryClient.invalidateQueries({ queryKey: profileKeys.cvs, exact: true });
  };
}

/** `PUT /api/cvs/me/profile`: "Lưu nháp" (AC-4). */
export function useSaveCvProfile() {
  const store = useStoreProfile();
  return useMutation({
    mutationFn: async (body: SaveCvProfileRequest) =>
      CvProfileViewSchema.parse(unwrap(await api.PUT('/api/cvs/me/profile', { body }))),
    onSuccess: store,
  });
}

/** `PUT /api/cvs/me/profile/confirm`: the CV becomes "Đã xác nhận" and counts for matching (AC-5). */
export function useConfirmCvProfile() {
  const store = useStoreProfile();
  return useMutation({
    mutationFn: async (body: SaveCvProfileRequest) =>
      CvProfileViewSchema.parse(unwrap(await api.PUT('/api/cvs/me/profile/confirm', { body }))),
    onSuccess: store,
  });
}

/** `POST /api/cvs/me/profile/reopen`: "Sửa lại" makes a new version to confirm again (AC-12). */
export function useReopenCvProfile() {
  const store = useStoreProfile();
  return useMutation({
    mutationFn: async (body: ReopenCvProfileRequest) =>
      CvProfileViewSchema.parse(unwrap(await api.POST('/api/cvs/me/profile/reopen', { body }))),
    onSuccess: store,
  });
}
