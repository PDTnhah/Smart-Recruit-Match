import { zodResolver } from '@hookform/resolvers/zod';
import { type Campaign, type CancelCampaignRequest, CancelCampaignRequestSchema } from '@srm/shared';
import { Ban, CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { applyServerFieldErrors } from '@/shared/forms/server-errors';
import { useCancelCampaign, useReloadCampaign } from './api';

type FormInput = z.input<typeof CancelCampaignRequestSchema>;

interface CancelCampaignDialogProps {
  campaign: Campaign;
  /** The version shown when the dialog opened; the request carries it. */
  rowVersion: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Hủy đợt" (US-1.10 AC-6, AC-10): a required reason, sent to the students and HR of the
 * campaign. Controlled, so "Xóa đợt" can offer it when the campaign has data.
 */
export function CancelCampaignDialog({ campaign, rowVersion, open, onOpenChange }: CancelCampaignDialogProps) {
  const cancel = useCancelCampaign(campaign.id);
  const reload = useReloadCampaign(campaign.id);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormInput, unknown, CancelCampaignRequest>({
    resolver: zodResolver(CancelCampaignRequestSchema),
    defaultValues: { rowVersion, reason: '' },
    mode: 'onTouched',
  });
  const pending = form.formState.isSubmitting;

  function close() {
    form.reset();
    setError(null);
    onOpenChange(false);
  }

  /** Esc, the overlay, "Quay lại": not while the request runs. */
  function change(next: boolean) {
    if (pending) return;
    if (next) onOpenChange(true);
    else close();
  }

  async function onSubmit(values: CancelCampaignRequest) {
    setError(null);
    try {
      await cancel.mutateAsync({ ...values, rowVersion });
      close();
      toast.success(`Đã hủy đợt “${campaign.name}”`, {
        description: 'Sinh viên và HR của đợt được báo kèm lý do.',
      });
    } catch (caught) {
      // A stale rowVersion (409) or a campaign that cannot be cancelled any more (422): what the
      // dialog shows is out of date (DESIGN.md §6 alert-dialog).
      if (caught instanceof ApiRequestError && (caught.status === 409 || caught.status === 422)) {
        close();
        toast.error(apiErrorMessage(caught));
        reload();
        return;
      }
      if (applyServerFieldErrors(caught, form.setError, ['reason'])) return;
      setError(apiErrorMessage(caught));
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Ban data-icon="inline-start" />
          Hủy đợt
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
        <form noValidate onSubmit={(event) => void form.handleSubmit(onSubmit)(event)} className="flex flex-col gap-6">
          <AlertDialogHeader>
            <AlertDialogTitle>Hủy đợt “{campaign.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Đợt dừng mọi thao tác và ẩn với sinh viên, HR. CV, JD, nguyện vọng, bài test và nhật ký được giữ lại.
              Sinh viên thuộc đối tượng và HR của các công ty có JD trong đợt được báo kèm lý do. Đợt đã hủy không mở
              lại được.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Chưa hủy được đợt</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Controller
            name="reason"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`campaign-${campaign.id}-cancel-reason`}>Lý do hủy</FieldLabel>
                <Textarea
                  {...field}
                  id={`campaign-${campaign.id}-cancel-reason`}
                  autoFocus
                  disabled={pending}
                  placeholder="Ví dụ: không đủ doanh nghiệp tham gia"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : (
                  <FieldDescription>Sinh viên và HR đọc được lý do này.</FieldDescription>
                )}
              </Field>
            )}
          />
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => change(false)}>
              Quay lại
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {pending ? 'Đang hủy đợt' : 'Hủy đợt'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
