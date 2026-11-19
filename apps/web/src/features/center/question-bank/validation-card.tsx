import type { ExamBlueprintView } from '@srm/shared';
import { CircleAlert, ListChecks } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { formatNumber } from '@/lib/format';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { useValidateQuestions } from './api';
import { uncheckedOf } from './coverage';
import { RunStatus } from './run-status';

/**
 * "Kiểm câu bằng AI" (US-4.10 AC-5, CONTEXT D60): optional; the Validator checks the questions
 * nobody has checked yet, as a job of its own, and its latest run shows as the generation's does.
 * Off, with the reasons right above the button (DESIGN.md §6 `alert-dialog`), while the bank is
 * locked, a run is RUNNING, the blueprint is being edited, or no question is left to check. A 409
 * closes the dialog with a toast; the view read again then shows the bank as it is.
 */
export function ValidationCard({ view, editing }: { view: ExamBlueprintView; editing: boolean }) {
  const validate = useValidateQuestions(view.jdId);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = validate.isPending;
  const unchecked = uncheckedOf(view);
  const running = view.run?.status === 'RUNNING' || view.validationRun?.status === 'RUNNING';
  const blockers = [
    view.locked && 'Ngân hàng đã khóa: câu hỏi không đổi được nữa.',
    !view.locked && running && 'AI đang sinh hoặc kiểm câu. Chờ lượt chạy xong.',
    !view.locked && editing && 'Đang sửa ma trận đề: lưu hoặc hủy thay đổi trước.',
    !view.locked && !running && unchecked === 0 && 'Không còn câu nào chưa kiểm.',
  ].filter((blocker): blocker is string => typeof blocker === 'string');

  async function confirm() {
    setError(null);
    try {
      await validate.mutateAsync();
      setOpen(false);
      toast.success('Đã bắt đầu kiểm câu bằng AI. Trang tự cập nhật khi xong.');
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 409) {
        setOpen(false);
        toast.error(apiErrorMessage(caught));
        return;
      }
      setError(apiErrorMessage(caught));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kiểm câu bằng AI</CardTitle>
        <CardDescription>
          Tùy chọn. AI tự giải từng câu chưa kiểm mà không xem đáp án, rồi loại câu sai đáp án, có nhiều đáp án đúng, lộ
          đáp án, lệch kỹ năng hay độ khó, đề chưa rõ hoặc trùng ý. Câu bị loại không được tính vào ô; ô thiếu câu thì bấm
          "Sinh câu còn thiếu".
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <RunStatus run={view.validationRun} />
        <p className="text-sm text-muted-foreground tabular-nums">
          {formatNumber(unchecked)} câu chưa kiểm trong các ô của ma trận đề.
        </p>
        {blockers.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        )}
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            if (pending) return;
            setOpen(next);
            if (!next) setError(null);
          }}
        >
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto sm:self-start" disabled={blockers.length > 0}>
              <ListChecks data-icon="inline-start" />
              Kiểm câu bằng AI
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Kiểm {formatNumber(unchecked)} câu bằng AI?</AlertDialogTitle>
              <AlertDialogDescription>
                AI kiểm các câu chưa kiểm của ma trận đề, mỗi lượt tối đa 15 câu trắc nghiệm hoặc 5 câu tự luận. Trong lúc
                kiểm, ma trận đề không sửa được, không sinh thêm câu và chưa khóa được ngân hàng.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>Chưa bắt đầu kiểm câu được</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Hủy</AlertDialogCancel>
              <Button onClick={() => void confirm()} disabled={pending}>
                {pending && <Spinner data-icon="inline-start" />}
                {pending ? 'Đang gửi' : 'Kiểm câu bằng AI'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
