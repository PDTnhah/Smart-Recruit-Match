import type { JobDescription } from '@srm/shared';
import { CircleAlert, CircleCheck } from 'lucide-react';
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
import { useApproveJd } from '@/features/jds/api';
import { JD_REASON_MESSAGES } from '@/features/jds/labels';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';

function approveErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.body?.code === 'TRANSITION_CONDITION_FAILED') {
    const reasonCode = error.body.details?.reasonCode;
    if (typeof reasonCode === 'string' && reasonCode in JD_REASON_MESSAGES) return JD_REASON_MESSAGES[reasonCode]!;
  }
  return apiErrorMessage(error);
}

/**
 * "Duyệt JD" with a confirmation (US-1.5 AC-7, AC-10). The dialog stays open while the request
 * runs and shows why the JD could not be approved (e.g. someone approved it first: 409).
 */
export function ApproveJdDialog({ jd }: { jd: JobDescription }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approve = useApproveJd(jd.id);
  const pending = approve.isPending;

  async function confirm() {
    setError(null);
    try {
      await approve.mutateAsync(jd.rowVersion);
      setOpen(false);
      toast.success(`Đã duyệt JD “${jd.title}”`);
    } catch (caught) {
      setError(approveErrorMessage(caught));
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
          <CircleCheck data-icon="inline-start" />
          Duyệt JD
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Duyệt JD “{jd.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Kiểm tra nội dung JD hợp lệ và chỉ tiêu {jd.quota} là hợp lý. Sau khi duyệt, hệ thống bắt đầu sinh ngân hàng
            câu hỏi cho JD; thao tác này không hoàn tác được.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Không duyệt được JD</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Hủy</AlertDialogCancel>
          <Button onClick={() => void confirm()} disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            {pending ? 'Đang duyệt' : 'Duyệt JD'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
