import { type Campaign, type EssayGradingDispatch, EssayGradingDispatchSchema } from '@srm/shared';
import { useMutation } from '@tanstack/react-query';
import { CircleAlert, FileCheck } from 'lucide-react';
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
import { Spinner } from '@/components/ui/spinner';
import { api, unwrap } from '@/shared/api/client';
import { apiErrorMessage } from '@/shared/api/errors';

/** `POST /api/campaigns/{id}/essay-grading`. */
function useEssayGrading(campaignId: number) {
  return useMutation({
    mutationFn: async (): Promise<EssayGradingDispatch> =>
      EssayGradingDispatchSchema.parse(
        unwrap(await api.POST('/api/campaigns/{id}/essay-grading', { params: { path: { id: campaignId } } })),
      ),
  });
}

function sentMessage({ runs }: EssayGradingDispatch): string {
  const count = (sent: boolean) => runs.filter((run) => run.sent === sent).reduce((sum, run) => sum + run.sessionCount, 0);
  const [sent, held] = [count(true), count(false)];
  if (sent + held === 0) return 'Không có bài mới cần chấm tự luận.';
  const parts: string[] = [];
  if (sent > 0) parts.push(`Đã gửi ${sent} bài đi chấm tự luận`);
  if (held > 0) parts.push(`${held} bài chưa gửi được, hệ thống tự gửi lại sau ít phút`);
  return `${parts.join('; ')}.`;
}

/**
 * "Chấm tự luận" on the campaign page (US-4.4 AC-2, CONTEXT D53): sends the essays of the sessions
 * closed so far to the Grader before the sweep does it at `testing_end`. Sending again sends only
 * what is new; results are still published after `testing_end`. The dialog stays open while the
 * request runs and shows its error.
 */
export function EssayGradingDialog({ campaign }: { campaign: Campaign }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const grading = useEssayGrading(campaign.id);
  const pending = grading.isPending;

  async function confirm() {
    setError(null);
    try {
      const result = await grading.mutateAsync();
      setOpen(false);
      toast.success(sentMessage(result));
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <FileCheck data-icon="inline-start" />
          Chấm tự luận
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Gửi chấm tự luận các bài đã nộp?</AlertDialogTitle>
          <AlertDialogDescription>
            Câu tự luận của các bài test đã nộp mà chưa gửi chấm sẽ được AI chấm hai lần theo tiêu chí của đề. Mỗi bài
            chỉ gửi một lần; bài nộp sau được gửi ở lần bấm sau, hoặc tự động khi hết hạn làm bài test. AI chấm theo
            lô nên điểm có thể về sau vài giờ. Sinh viên chỉ xem được kết quả sau khi hết hạn làm bài test.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Chưa gửi được bài đi chấm</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Hủy</AlertDialogCancel>
          <Button onClick={() => void confirm()} disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            {pending ? 'Đang gửi' : 'Gửi chấm'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
