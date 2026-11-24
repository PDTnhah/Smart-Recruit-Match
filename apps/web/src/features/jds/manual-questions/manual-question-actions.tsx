import type { ManualQuestionCell } from '@srm/shared';
import { Lock } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ImportQuestionsSheet } from './import-questions-sheet';
import { ManualQuestionSheet } from './manual-question-sheet';

/**
 * "Thêm câu" and "Import file" of a JD's bank (US-4.13 AC-10), for CENTER and HR alike. A locked bank or a closed
 * campaign only reads: an alert says why instead of the buttons (AC-6). While AI generates or checks questions, or
 * while the blueprint predates the JD's requirements (409 QUESTION_BANK_JD_OUTDATED), the buttons are off and the
 * reason shows next to them (DESIGN.md §6 › alert-dialog); HR does not see the runs, so the API's 409 tells it.
 */
export function ManualQuestionActions({
  jdId,
  cells,
  locked,
  readOnly = false,
  running = false,
  outdated = false,
}: {
  jdId: number;
  cells: readonly ManualQuestionCell[];
  locked: boolean;
  /** The campaign is closed or cancelled. */
  readOnly?: boolean;
  running?: boolean;
  /** The JD's requirements are newer than the blueprint. */
  outdated?: boolean;
}) {
  if (locked || readOnly) {
    return (
      <Alert>
        <Lock />
        <AlertTitle>{locked ? 'Ngân hàng câu hỏi đã khóa' : 'Đợt thực tập đã kết thúc'}</AlertTitle>
        <AlertDescription>
          {locked
            ? 'Không thêm câu được nữa vì bài test chỉ rút câu từ ngân hàng đã khóa. Các câu dưới đây chỉ để xem.'
            : 'Không thêm câu được nữa. Các câu dưới đây chỉ để xem.'}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <ManualQuestionSheet jdId={jdId} cells={cells} disabled={running || outdated} />
      <ImportQuestionsSheet jdId={jdId} disabled={running || outdated} />
      {outdated ? (
        <p className="text-sm text-muted-foreground">
          Yêu cầu của JD đã có phiên bản mới: thêm câu được khi Trung tâm lưu lại ma trận đề theo yêu cầu mới.
        </p>
      ) : (
        running && <p className="text-sm text-muted-foreground">AI đang sinh hoặc kiểm câu: thêm câu được khi lượt chạy xong.</p>
      )}
    </div>
  );
}
