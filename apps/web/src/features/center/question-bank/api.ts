import {
  type ExamBlueprintView,
  ExamBlueprintViewSchema,
  type LockQuestionBankRequest,
  QuestionGenerationRunSchema,
  type UpdateExamBlueprintRequest,
} from '@srm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { jdKeys } from '@/features/jds/api';
import { api, unwrap } from '@/shared/api/client';

// Exam blueprint and question bank of a JD (US-4.1 AC-3, AC-11, US-4.2 AC-10). Responses are parsed with the
// shared schemas. No SSE: the view is polled while a generation run is RUNNING (CONTEXT D49).

export const examBlueprintKey = (jdId: number) => [...jdKeys.all, 'exam-blueprint', jdId] as const;

/** How often the view is read again while AI generates questions. */
const RUNNING_POLL_MS = 5_000;

export function useExamBlueprint(jdId: number, { poll }: { poll: boolean }) {
  return useQuery({
    queryKey: examBlueprintKey(jdId),
    queryFn: async () =>
      ExamBlueprintViewSchema.parse(
        unwrap(await api.GET('/api/jds/{id}/exam-blueprint', { params: { path: { id: jdId } } })),
      ),
    refetchInterval: (query) => (poll && query.state.data?.run?.status === 'RUNNING' ? RUNNING_POLL_MS : false),
  });
}

/** `PUT /api/jds/{id}/exam-blueprint`: 409 while a run is RUNNING, once locked, or on a stale row_version. */
export function useUpdateExamBlueprint(jdId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateExamBlueprintRequest) =>
      ExamBlueprintViewSchema.parse(
        unwrap(await api.PUT('/api/jds/{id}/exam-blueprint', { params: { path: { id: jdId } }, body })),
      ),
    onSuccess: (view: ExamBlueprintView) => queryClient.setQueryData(examBlueprintKey(jdId), view),
  });
}

/**
 * `POST /api/jds/{id}/question-bank/generate` ("Sinh câu còn thiếu"): answers the running run when
 * there is one, so a second click starts no second job. The view is read again to start polling.
 */
export function useGenerateQuestions(jdId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      QuestionGenerationRunSchema.parse(
        unwrap(await api.POST('/api/jds/{id}/question-bank/generate', { params: { path: { id: jdId } } })),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: examBlueprintKey(jdId) }),
  });
}

/**
 * `POST /api/question-banks/{id}/lock` (US-4.2 AC-6). `rowVersion` is the one of the view CENTER
 * confirmed in the dialog, not of the latest query (LESSONS §25). The locked view replaces the
 * cached one; after a failure the view is read again, so a 409 shows the bank as it is now.
 */
export function useLockQuestionBank(jdId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ bankId, rowVersion }: { bankId: number } & LockQuestionBankRequest) =>
      ExamBlueprintViewSchema.parse(
        unwrap(
          await api.POST('/api/question-banks/{id}/lock', { params: { path: { id: bankId } }, body: { rowVersion } }),
        ),
      ),
    onSuccess: (view: ExamBlueprintView) => queryClient.setQueryData(examBlueprintKey(jdId), view),
    onError: () => queryClient.invalidateQueries({ queryKey: examBlueprintKey(jdId) }),
  });
}
