import { QuestionReviewSampleSchema, type SubmitQuestionReviewRequest } from '@srm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { examBlueprintKey } from '@/features/center/question-bank/api';
import { jdKeys } from '@/features/jds/api';
import { api, unwrap } from '@/shared/api/client';

// Sample review of a JD's question bank, for HR and CENTER (FR-19, US-4.9 AC-1, AC-3, AC-6). Responses are
// parsed with the shared schema.

export const reviewSampleKey = (jdId: number) => [...jdKeys.all, 'question-review-sample', jdId] as const;

export function useReviewSample(jdId: number) {
  return useQuery({
    queryKey: reviewSampleKey(jdId),
    queryFn: async () =>
      QuestionReviewSampleSchema.parse(
        unwrap(await api.GET('/api/jds/{id}/question-bank/sample', { params: { path: { id: jdId } } })),
      ),
  });
}

/**
 * `POST /api/jds/{id}/question-bank/sample/reviews`: answers with the sample as it is now. An ERROR retires the
 * question, so CENTER's bank view (coverage, version) is read again too.
 */
export function useSubmitQuestionReview(jdId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SubmitQuestionReviewRequest) =>
      QuestionReviewSampleSchema.parse(
        unwrap(await api.POST('/api/jds/{id}/question-bank/sample/reviews', { params: { path: { id: jdId } }, body })),
      ),
    onSuccess: (sample, body) => {
      queryClient.setQueryData(reviewSampleKey(jdId), sample);
      if (body.verdict === 'ERROR') void queryClient.invalidateQueries({ queryKey: examBlueprintKey(jdId) });
    },
    // The question may have been retired or changed meanwhile (409): show the sample as it is now.
    onError: () => queryClient.invalidateQueries({ queryKey: reviewSampleKey(jdId) }),
  });
}
