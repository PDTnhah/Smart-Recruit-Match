import type { JobDescription } from '@srm/shared';
import { CircleAlert, Save, Send } from 'lucide-react';
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
import { useSubmitJd } from '@/features/jds/api';
import { JD_REASON_MESSAGES } from '@/features/jds/labels';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';

function submitErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.body?.code === 'TRANSITION_CONDITION_FAILED') {
    const reasonCode = error.body.details?.reasonCode;
    if (typeof reasonCode === 'string' && reasonCode in JD_REASON_MESSAGES) return JD_REASON_MESSAGES[reasonCode]!;
  }
  return apiErrorMessage(error);
}

/**
 * "Nộp JD" with a confirmation (US-1.5 AC-6, AC-10): after submission the JD can no longer be
 * edited. With unsaved form input, submitting is blocked: the API would get the last saved version.
 */
export function SubmitJdDialog({ jd, unsavedChanges = false }: { jd: JobDescription; unsavedChanges?: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = useSubmitJd(jd.id);
  const pending = submit.isPending;

  async function confirm() {
    setError(null);
    try {
      await submit.mutateAsync(jd.rowVersion);
      setOpen(false);
      toast.success('Đã nộp JD. Hệ thống sẽ phân tích yêu cầu của JD.');
    } catch (caught) {
      setError(submitErrorMessage(caught));
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
        <Button>
          <Send data-icon="inline-start" />
          Nộp JD
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Nộp JD “{jd.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Sau khi nộp, JD không sửa được nữa. Hệ thống phân tích JD thành yêu cầu chuẩn hóa để HR xác nhận, rồi Trung
            tâm duyệt.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {unsavedChanges && (
          <Alert>
            <Save />
            <AlertTitle>Còn thay đổi chưa lưu</AlertTitle>
            <AlertDescription>Bấm "Lưu thay đổi" trong form trước, rồi mới nộp JD.</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Chưa nộp được JD</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Hủy</AlertDialogCancel>
          <Button onClick={() => void confirm()} disabled={pending || unsavedChanges}>
            {pending && <Spinner data-icon="inline-start" />}
            {pending ? 'Đang nộp' : 'Nộp JD'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
