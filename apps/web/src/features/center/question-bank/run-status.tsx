import type { QuestionGenerationRun } from '@srm/shared';
import { CircleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { RUN_STATUS_BADGE, RUN_STATUS_LABELS, runErrorMessage } from './labels';

/**
 * The latest run of one kind (US-4.1 AC-11, US-4.10 AC-5): running or failed as an `Alert`, finished
 * as a badge with what it did (DESIGN.md §6). A generation names the new questions and the cells it
 * left short; an AI check, the questions it gave a verdict.
 */
export function RunStatus({ run }: { run: QuestionGenerationRun | null }) {
  if (run === null) return null;
  const labels = RUN_STATUS_LABELS[run.kind];
  const generation = run.kind === 'GENERATE';
  if (run.status === 'RUNNING') {
    return (
      <Alert>
        <Spinner />
        <AlertTitle>{labels.RUNNING}</AlertTitle>
        <AlertDescription>
          AI bắt đầu {generation ? 'sinh' : 'kiểm'} câu {formatRelative(run.createdAt)}, thường xong trong vài phút. Trang
          tự cập nhật khi xong.
        </AlertDescription>
      </Alert>
    );
  }
  if (run.status === 'FAILED') {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>{labels.FAILED}</AlertTitle>
        <AlertDescription>
          {runErrorMessage(run.kind, run.errorCode)}{' '}
          {generation
            ? 'Các câu đã sinh được giữ lại. Bấm "Sinh câu còn thiếu" để sinh tiếp.'
            : 'Kết quả kiểm đã có được giữ lại. Bấm "Kiểm câu bằng AI" để kiểm tiếp.'}
        </AlertDescription>
      </Alert>
    );
  }
  const finished = run.finishedAt ? `Xong lúc ${formatDateTime(run.finishedAt)}, ` : '';
  const left = run.missingCells?.length ?? 0;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{generation ? 'Lượt sinh gần nhất' : 'Lượt kiểm gần nhất'}</span>
        <Badge variant={RUN_STATUS_BADGE[run.status]}>{labels[run.status]}</Badge>
      </div>
      <p className="text-muted-foreground">
        {generation
          ? `${finished}${finished ? 'thêm' : 'Thêm'} ${formatNumber(run.questionsReceived)} câu mới.`
          : `${finished}${finished ? 'đã kiểm' : 'Đã kiểm'} ${formatNumber(run.questionsReceived)} câu.`}
        {run.status === 'PARTIAL' &&
          (generation
            ? ` AI dừng khi còn ${formatNumber(left)} ô chưa đủ câu.`
            : ' Còn câu AI chưa kiểm được; bấm "Kiểm câu bằng AI" để kiểm tiếp.')}
      </p>
    </div>
  );
}
