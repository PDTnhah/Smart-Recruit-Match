import type { Campaign } from '@srm/shared';
import { CircleAlert, DoorOpen } from 'lucide-react';
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
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { useOpenCampaign } from './api';
import { OPEN_FAILURE_MESSAGES } from './labels';

function openErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.body?.code === 'TRANSITION_CONDITION_FAILED') {
    const reasonCode = error.body.details?.reasonCode;
    if (typeof reasonCode === 'string' && reasonCode in OPEN_FAILURE_MESSAGES) {
      return OPEN_FAILURE_MESSAGES[reasonCode]!;
    }
  }
  return apiErrorMessage(error);
}

/**
 * "Mở đợt" with a confirmation (US-1.4 AC-5, AC-9). The dialog stays open while the request runs
 * and shows why the campaign could not open (missing or past deadlines).
 */
export function OpenCampaignDialog({ campaign, size = 'default' }: { campaign: Campaign; size?: 'default' | 'sm' }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openCampaign = useOpenCampaign(campaign.id);
  const pending = openCampaign.isPending;

  async function confirm() {
    setError(null);
    try {
      await openCampaign.mutateAsync(campaign.rowVersion);
      setOpen(false);
      toast.success(`Đã mở đợt “${campaign.name}”`);
    } catch (caught) {
      setError(openErrorMessage(caught));
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
        <Button size={size}>
          <DoorOpen data-icon="inline-start" />
          Mở đợt
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mở đợt “{campaign.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Doanh nghiệp và sinh viên thuộc đối tượng của đợt sẽ thấy đợt và bắt đầu nộp JD, CV. Sau khi mở, tên,
            đối tượng và tham số bị khóa; chỉ được lùi các mốc chưa tới.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Không mở được đợt</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Hủy</AlertDialogCancel>
          <Button onClick={() => void confirm()} disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            {pending ? 'Đang mở đợt' : 'Mở đợt'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
