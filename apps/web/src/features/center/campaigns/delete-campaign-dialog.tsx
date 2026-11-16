import type { Campaign } from '@srm/shared';
import { CircleAlert, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
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
import { useDeleteCampaign, useReloadCampaign } from './api';
import { CAMPAIGNS_PATH } from './paths';

interface DeleteCampaignDialogProps {
  campaign: Campaign;
  /** The version shown when the dialog opened; the request carries it. */
  rowVersion: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Offered when the campaign has data and can still be cancelled. */
  onCancelInstead?: (() => void) | undefined;
}

/**
 * "Xóa đợt" (US-1.10 AC-9, AC-10): only a campaign nothing refers to yet; the API's foreign keys
 * decide. With data (409 CAMPAIGN_HAS_DATA) the dialog stays open and offers to cancel instead.
 */
export function DeleteCampaignDialog({
  campaign,
  rowVersion,
  open,
  onOpenChange,
  onCancelInstead,
}: DeleteCampaignDialogProps) {
  const navigate = useNavigate();
  const remove = useDeleteCampaign(campaign.id);
  const reload = useReloadCampaign(campaign.id);
  const [hasData, setHasData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = remove.isPending;

  function close() {
    setHasData(false);
    setError(null);
    onOpenChange(false);
  }

  /** Esc, the overlay, "Quay lại": not while the request runs. */
  function change(next: boolean) {
    if (pending) return;
    if (next) onOpenChange(true);
    else close();
  }

  async function confirm() {
    setError(null);
    try {
      await remove.mutateAsync(rowVersion);
      close();
      toast.success(`Đã xóa đợt “${campaign.name}”`);
      void navigate(CAMPAIGNS_PATH, { replace: true });
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.body?.code === 'CAMPAIGN_HAS_DATA') {
        setHasData(true);
        return;
      }
      // A stale rowVersion: the campaign changed since the page loaded.
      if (caught instanceof ApiRequestError && caught.status === 409) {
        close();
        toast.error(apiErrorMessage(caught));
        reload();
        return;
      }
      setError(apiErrorMessage(caught));
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Trash2 data-icon="inline-start" />
          Xóa đợt
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xóa đợt “{campaign.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Đợt bị xóa hẳn và không khôi phục được. Chỉ xóa được đợt chưa có dữ liệu: chưa sinh viên nào đồng ý điều
            khoản hay nộp CV, chưa doanh nghiệp nào tạo JD.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {hasData && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Đợt đã có dữ liệu nên không xóa được</AlertTitle>
            <AlertDescription>
              {onCancelInstead ? (
                <>
                  <p>Hủy đợt để dừng đợt mà vẫn giữ dữ liệu; sinh viên và HR của đợt được báo.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full sm:w-auto"
                    onClick={() => {
                      close();
                      onCancelInstead();
                    }}
                  >
                    Hủy đợt thay vì xóa
                  </Button>
                </>
              ) : (
                <p>Dữ liệu của đợt được giữ lại.</p>
              )}
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Chưa xóa được đợt</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Quay lại</AlertDialogCancel>
          {!hasData && (
            <Button variant="destructive" onClick={() => void confirm()} disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {pending ? 'Đang xóa đợt' : 'Xóa đợt'}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
