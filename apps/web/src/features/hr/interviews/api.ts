import {
  type InterviewResultRequest,
  InterviewResultResponseSchema,
  JdInterviewListSchema,
  type RescheduleInterviewRequest,
  type ScheduleInterviewRequest,
  StaffInterviewViewSchema,
} from '@srm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api/client';
import { nominationKeys } from '@/features/hr/nominations/api';

// API hooks of "Phỏng vấn" in the HR portal (US-5.4). Responses are parsed with the shared schemas.

export const interviewKeys = {
  jd: (jdId: number) => ['interviews', 'jd', jdId] as const,
};

/** AC-12: the JD's invited nominations with interview and offer, and its places (BR-14). */
export function useJdInterviews(jdId: number) {
  return useQuery({
    queryKey: interviewKeys.jd(jdId),
    queryFn: async () =>
      JdInterviewListSchema.parse(unwrap(await api.GET('/api/jds/{id}/interviews', { params: { path: { id: jdId } } }))),
  });
}

/** Every write reloads the list here and the "Đề cử" tab, whose states it changes. */
function useReload(jdId: number) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: interviewKeys.jd(jdId) }),
      queryClient.invalidateQueries({ queryKey: nominationKeys.jd(jdId) }),
    ]);
}

/** AC-1: one interview for a nomination HR invited. */
export function useScheduleInterview(jdId: number) {
  const reload = useReload(jdId);
  return useMutation({
    mutationFn: async (body: ScheduleInterviewRequest) =>
      StaffInterviewViewSchema.parse(unwrap(await api.POST('/api/interviews', { body }))),
    onSettled: reload,
  });
}

/** AC-2: a new time, at the row version the dialog was opened with (LESSONS §25). */
export function useRescheduleInterview(jdId: number, interviewId: number) {
  const reload = useReload(jdId);
  return useMutation({
    mutationFn: async (body: RescheduleInterviewRequest) =>
      StaffInterviewViewSchema.parse(unwrap(await api.PUT('/api/interviews/{id}', { params: { path: { id: interviewId } }, body }))),
    onSettled: reload,
  });
}

/** AC-3, AC-4: HR's result; the response says whether PASSED became RESERVE for lack of a place. */
export function useRecordInterviewResult(jdId: number, interviewId: number) {
  const reload = useReload(jdId);
  return useMutation({
    mutationFn: async (body: InterviewResultRequest) =>
      InterviewResultResponseSchema.parse(
        unwrap(await api.PUT('/api/interviews/{id}/result', { params: { path: { id: interviewId } }, body })),
      ),
    onSettled: reload,
  });
}
