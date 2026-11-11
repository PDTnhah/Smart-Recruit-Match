import {
  type ExamGradingReason,
  type GradingQueue,
  GradingQueueSchema,
  type ManualGradeRequest,
  ManualGradeResultSchema,
  ManualGradingDetailSchema,
} from '@srm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api/client';

// API hooks of "Chấm tay" in the center portal (US-4.5, CONTEXT D54). Responses are parsed with
// the shared schemas, so the screen uses the same types as the API.

/** Sessions per page of the queue. */
export const GRADING_QUEUE_PAGE_SIZE = 20;

export interface GradingQueueFilter {
  reason?: ExamGradingReason;
  offset: number;
}

export const gradingKeys = {
  all: ['grading'] as const,
  queues: ['grading', 'queue'] as const,
  queue: (campaignId: number, filter: GradingQueueFilter) => ['grading', 'queue', campaignId, filter] as const,
  detail: (answerId: number) => ['grading', 'answer', answerId] as const,
};

/** A page of the queue with the offset it was loaded at, which may lag the URL while the next loads. */
export type GradingQueuePage = GradingQueue & { offset: number };

/**
 * The campaign's sessions with an essay waiting for a grader. The page stays while the next page
 * loads; another campaign or reason is another list, so it starts from the loading state.
 */
export function useGradingQueue(campaignId: number | null, filter: GradingQueueFilter) {
  const key = gradingKeys.queue(campaignId ?? 0, filter);
  return useQuery({
    queryKey: key,
    enabled: campaignId !== null,
    placeholderData: (previous, previousQuery) => {
      const previousKey = previousQuery?.queryKey;
      return previousKey?.[2] === key[2] && previousKey[3].reason === filter.reason ? previous : undefined;
    },
    queryFn: async (): Promise<GradingQueuePage> => ({
      ...GradingQueueSchema.parse(
        unwrap(
          await api.GET('/api/campaigns/{id}/grading-queue', {
            params: {
              path: { id: campaignId! },
              query: {
                ...(filter.reason ? { reason: filter.reason } : {}),
                limit: GRADING_QUEUE_PAGE_SIZE,
                offset: filter.offset,
              },
            },
          }),
        ),
      ),
      offset: filter.offset,
    }),
  });
}

export function useManualGradingDetail(answerId: number) {
  return useQuery({
    queryKey: gradingKeys.detail(answerId),
    queryFn: async () =>
      ManualGradingDetailSchema.parse(
        unwrap(await api.GET('/api/exam-answers/{id}/manual-grading', { params: { path: { id: answerId } } })),
      ),
  });
}

/**
 * Saves a grade: the detail becomes the read-only grade the API returns and the queue reloads. A
 * failure reloads both, so a 409 shows the grade saved first. The reloads are not awaited: the
 * sheet closes as soon as the grade is saved.
 */
export function useManualGrade(answerId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: ManualGradeRequest) =>
      ManualGradeResultSchema.parse(
        unwrap(await api.PUT('/api/exam-answers/{id}/manual-grade', { params: { path: { id: answerId } }, body })),
      ),
    onSuccess: (result) => {
      queryClient.setQueryData(gradingKeys.detail(answerId), result.detail);
      void queryClient.invalidateQueries({ queryKey: gradingKeys.queues });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: gradingKeys.all });
    },
  });
}
