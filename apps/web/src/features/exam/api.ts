import {
  type ExamPaper,
  ExamPaperSchema,
  type ExamSubmission,
  ExamSubmissionSchema,
  MyExamsResponseSchema,
  type SaveExamAnswersRequest,
  type SaveExamAnswersResult,
  SaveExamAnswersResultSchema,
} from '@srm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api/client';
import { clockOffsetOf } from './server-clock';

// API hooks of the exam room (US-4.3, CONTEXT D51): the student's tests, start or resume, autosave,
// submit. Parsed with the shared schemas; every response with `serverNow` also gives the offset of
// the device's clock (server-clock.ts).

export const examKeys = {
  mine: ['me', 'exams'] as const,
  session: (sessionId: number) => ['exam-sessions', sessionId] as const,
};

/** A response carrying `serverNow`, with how many ms the server's clock is ahead of the browser's. */
export interface Timed<T> {
  data: T;
  offsetMs: number;
}

export type TimedPaper = Timed<ExamPaper>;

async function timed<T extends { serverNow: string }>(request: () => Promise<T>): Promise<Timed<T>> {
  const sentAt = Date.now();
  const data = await request();
  return { data, offsetMs: clockOffsetOf(data.serverNow, sentAt, Date.now()) };
}

/** How often "Bài test" reads the list again while tests can be started: the time left changes. */
const OPEN_REFETCH_MS = 60_000;

/** `GET /api/me/exams` (AC-14): the preferences of the latest campaign with where each test stands. */
export function useMyExams({ refetchWhileOpen = false }: { refetchWhileOpen?: boolean } = {}) {
  return useQuery({
    queryKey: examKeys.mine,
    queryFn: async () => MyExamsResponseSchema.parse(unwrap(await api.GET('/api/me/exams'))),
    refetchInterval: (query) => (refetchWhileOpen && query.state.data?.campaign?.testingOpen ? OPEN_REFETCH_MS : false),
  });
}

/**
 * `GET /api/exam-sessions/{id}` (AC-7): the paper and the answers the server holds. Read once per
 * visit of the room: the room keeps the answers from there, so a refetch must not overwrite them,
 * and the entry goes as soon as the room closes, so the next visit reads the server again.
 */
export function useExamSession(sessionId: number, enabled = true) {
  return useQuery({
    queryKey: examKeys.session(sessionId),
    enabled,
    queryFn: () =>
      timed(async () =>
        ExamPaperSchema.parse(unwrap(await api.GET('/api/exam-sessions/{id}', { params: { path: { id: sessionId } } }))),
      ),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * `POST /api/preferences/{id}/exam/start` (AC-1, AC-4): a new session, or the one already open. The
 * paper goes into the cache so the room opens without a second request.
 */
export function useStartExam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (preferenceId: number) =>
      timed(async () =>
        ExamPaperSchema.parse(
          unwrap(await api.POST('/api/preferences/{id}/exam/start', { params: { path: { id: preferenceId } } })),
        ),
      ),
    onSuccess: (paper) => {
      queryClient.setQueryData<TimedPaper>(examKeys.session(paper.data.sessionId), paper);
      void queryClient.invalidateQueries({ queryKey: examKeys.mine });
    },
  });
}

/** `PUT /api/exam-sessions/{id}/answers` (AC-6), called by the autosave. */
export function saveExamAnswers(sessionId: number, body: SaveExamAnswersRequest): Promise<Timed<SaveExamAnswersResult>> {
  return timed(async () =>
    SaveExamAnswersResultSchema.parse(
      unwrap(await api.PUT('/api/exam-sessions/{id}/answers', { params: { path: { id: sessionId } }, body })),
    ),
  );
}

/** `POST /api/exam-sessions/{id}/submit` (AC-8): the same result however many times it is sent. */
export function useSubmitExam(sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ExamSubmission> =>
      ExamSubmissionSchema.parse(
        unwrap(await api.POST('/api/exam-sessions/{id}/submit', { params: { path: { id: sessionId } } })),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: examKeys.mine }),
  });
}
