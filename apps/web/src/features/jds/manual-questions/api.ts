import {
  ManualQuestionListSchema,
  type ManualQuestionIssue,
  type QuestionImportFormat,
  QuestionImportPreviewSchema,
  type SaveManualQuestionsRequest,
  SaveManualQuestionsResultSchema,
} from '@srm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bankQuestionsKey, examBlueprintKey } from '@/features/center/question-bank/api';
import { jdKeys } from '@/features/jds/api';
import { api, unwrap } from '@/shared/api/client';
import { ApiRequestError } from '@/shared/api/errors';
import { postFormWithProgress } from '@/shared/api/upload';

// Questions CENTER and HR add by hand to a JD's bank, from the form or a file (US-4.13, CONTEXT D62). The same
// routes for both roles; the API checks the company (BR-11).

export const manualQuestionsKey = (jdId: number) => [...jdKeys.all, 'manual-questions', jdId] as const;

/** `GET /api/jds/{id}/question-bank/manual-questions` (AC-7): the questions HR of the JD's company added. */
export function useManualQuestions(jdId: number) {
  return useQuery({
    queryKey: manualQuestionsKey(jdId),
    queryFn: async () =>
      ManualQuestionListSchema.parse(
        unwrap(await api.GET('/api/jds/{id}/question-bank/manual-questions', { params: { path: { id: jdId } } })),
      ),
  });
}

/**
 * `POST /api/jds/{id}/question-bank/questions` (AC-1, AC-5): all the questions or none. A save changes the
 * coverage, CENTER's list and HR's: all three are read again, after a failure too (a 409 shows the bank as it is).
 */
export function useSaveManualQuestions(jdId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SaveManualQuestionsRequest) =>
      SaveManualQuestionsResultSchema.parse(
        unwrap(await api.POST('/api/jds/{id}/question-bank/questions', { params: { path: { id: jdId } }, body })),
      ),
    onSettled: async () => {
      await Promise.all(
        [examBlueprintKey(jdId), bankQuestionsKey(jdId), manualQuestionsKey(jdId)].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}

/** `POST /api/jds/{id}/question-bank/import/preview` (AC-4): every row checked, nothing saved; with upload progress. */
export function usePreviewImport(jdId: number) {
  return useMutation({
    mutationFn: async ({ file, onProgress }: { file: File; onProgress: (fraction: number) => void }) => {
      const form = new FormData();
      form.append('file', file);
      return QuestionImportPreviewSchema.parse(
        await postFormWithProgress(`/api/jds/${jdId}/question-bank/import/preview`, form, onProgress),
      );
    },
  });
}

/** AC-3: downloads the template of the JD's bank, `.xlsx` with the blueprint's cells or `.csv`. */
export async function downloadImportTemplate(jdId: number, format: QuestionImportFormat): Promise<void> {
  const blob: Blob = unwrap(
    await api.GET('/api/jds/{id}/question-bank/import-template', {
      params: { path: { id: jdId }, query: { format } },
      parseAs: 'blob',
    }),
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `mau-cau-hoi-jd-${jdId}.${format}`;
  document.body.append(link);
  link.click();
  link.remove();
  // Some browsers start the download after `click()` returns: the URL has to outlive it.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** The issues of a `400 MANUAL_QUESTIONS_INVALID` answer, by question; none for any other error. */
export function manualQuestionIssues(error: unknown): ManualQuestionIssue[] {
  if (!(error instanceof ApiRequestError) || error.body?.code !== 'MANUAL_QUESTIONS_INVALID') return [];
  const issues = error.body.details?.issues;
  return Array.isArray(issues) ? (issues as ManualQuestionIssue[]) : [];
}

/** Why a file was refused as a whole (AC-4), in Vietnamese; null for any other error. */
export function importFileErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiRequestError) || error.body?.code !== 'QUESTION_IMPORT_FILE_INVALID') return null;
  const details = error.body.details ?? {};
  switch (details.reason) {
    case 'UNSUPPORTED_TYPE':
      return 'Chỉ nhận file .xlsx hoặc .csv (UTF-8). Lưu file theo một trong hai định dạng rồi tải lên lại.';
    case 'MISSING_COLUMNS': {
      const columns = Array.isArray(details.columns) ? details.columns.join(', ') : '';
      return `File thiếu cột của mẫu: ${columns}. Tải file mẫu và giữ nguyên dòng tiêu đề.`;
    }
    case 'NO_ROWS':
      return 'File chưa có câu nào. Thêm câu vào từ dòng 2 của sheet "Câu hỏi".';
    case 'TOO_MANY_ROWS':
      return 'File có hơn 200 câu. Chia thành nhiều file rồi import lần lượt.';
    default:
      return 'Không đọc được file. Mở lại bằng Excel, lưu thành .xlsx rồi tải lên lại.';
  }
}
