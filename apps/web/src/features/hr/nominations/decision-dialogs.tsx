import { zodResolver } from '@hookform/resolvers/zod';
import {
  HR_REJECT_REASON_LABELS,
  HR_REJECT_REASONS,
  type HrRejectForm,
  HrRejectFormSchema,
  type NominationDetail,
} from '@srm/shared';
import { CalendarCheck, CircleAlert, CircleX } from 'lucide-react';
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { applyServerFieldErrors } from '@/shared/forms/server-errors';
import { useDecideNomination } from './api';

interface DecisionProps {
  jdId: number;
  nomination: NominationDetail;
}

/** A 409 means another HR decided first, or the version moved: close, say so, and the data reloads. */
function closeOnConflict(caught: unknown, close: () => void): boolean {
  if (!(caught instanceof ApiRequestError && caught.status === 409)) return false;
  close();
  toast.error(apiErrorMessage(caught));
  return true;
}

/**
 * "Mời phỏng vấn" (GĐ8 step 2, US-5.3 AC-5): HR confirms, the nomination becomes "Mời phỏng vấn"
 * for the student too. Sends the nomination's `rowVersion` from when the dialog opened (LESSONS §25).
 */
export function InviteDialog({ jdId, nomination }: DecisionProps) {
  const decide = useDecideNomination(jdId, nomination.nominationId);
  const [open, setOpen] = useState(false);
  const [rowVersion, setRowVersion] = useState(nomination.rowVersion);
  const [error, setError] = useState<string | null>(null);
  const pending = decide.isPending;

  function change(next: boolean) {
    if (pending) return;
    if (next) setRowVersion(nomination.rowVersion);
    else setError(null);
    setOpen(next);
  }

  async function confirm() {
    setError(null);
    try {
      await decide.mutateAsync({ decision: 'INVITE', rowVersion });
      change(false);
      toast.success(`Đã mời ${nomination.student.fullName} phỏng vấn`);
    } catch (caught) {
      if (closeOnConflict(caught, () => setOpen(false))) return;
      setError(apiErrorMessage(caught));
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogTrigger asChild>
        <Button className="w-full sm:w-auto">
          <CalendarCheck data-icon="inline-start" />
          Mời phỏng vấn
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mời {nomination.student.fullName} phỏng vấn?</AlertDialogTitle>
          <AlertDialogDescription>
            Sinh viên thấy trạng thái "Mời phỏng vấn" ở màn Đề cử. Lịch phỏng vấn được lên ở bước sau. Không đổi lại thành
            từ chối được.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Chưa gửi được lời mời</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => change(false)}>
            Quay lại
          </Button>
          <Button type="button" disabled={pending} onClick={() => void confirm()}>
            {pending && <Spinner data-icon="inline-start" />}
            {pending ? 'Đang gửi' : 'Mời phỏng vấn'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type RejectInput = z.input<typeof HrRejectFormSchema>;

/**
 * "Từ chối" (GĐ8 step 2, BR-12, US-5.3 AC-6): a reason of the catalogue and a note, both required.
 * The student sees the reason's label only; the note stays with HR and the center.
 */
export function RejectDialog({ jdId, nomination }: DecisionProps) {
  const decide = useDecideNomination(jdId, nomination.nominationId);
  const [open, setOpen] = useState(false);
  const [rowVersion, setRowVersion] = useState(nomination.rowVersion);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<RejectInput, unknown, HrRejectForm>({
    resolver: zodResolver(HrRejectFormSchema),
    defaultValues: { note: '' },
    mode: 'onTouched',
  });
  const pending = form.formState.isSubmitting;
  const idPrefix = `nomination-${nomination.nominationId}-reject`;

  function change(next: boolean) {
    if (pending) return;
    if (next) setRowVersion(nomination.rowVersion);
    else {
      form.reset();
      setError(null);
    }
    setOpen(next);
  }

  async function onSubmit(values: HrRejectForm) {
    setError(null);
    try {
      await decide.mutateAsync({ decision: 'REJECT', rowVersion, ...values });
      change(false);
      toast.success(`Đã từ chối ${nomination.student.fullName}`, {
        description: 'Sinh viên về hàng chờ với các nguyện vọng còn lại.',
      });
    } catch (caught) {
      if (
        closeOnConflict(caught, () => {
          form.reset();
          setOpen(false);
        })
      ) {
        return;
      }
      if (applyServerFieldErrors(caught, form.setError, ['reasonCode', 'note'])) return;
      setError(apiErrorMessage(caught));
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto">
          <CircleX data-icon="inline-start" />
          Từ chối
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
        <form noValidate onSubmit={(event) => void form.handleSubmit(onSubmit)(event)} className="flex flex-col gap-6">
          <AlertDialogHeader>
            <AlertDialogTitle>Từ chối {nomination.student.fullName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Nguyện vọng này đóng lại và sinh viên không được đề cử lại vào JD này trong đợt. Sinh viên chỉ thấy lý do theo
              danh mục, không thấy ghi chú. Không hoàn tác được.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Chưa lưu được quyết định</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <Controller
              name="reasonCode"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${idPrefix}-reason`}>Lý do</FieldLabel>
                  <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={pending}>
                    <SelectTrigger
                      id={`${idPrefix}-reason`}
                      ref={field.ref}
                      className="w-full"
                      aria-invalid={fieldState.invalid}
                      onBlur={field.onBlur}
                    >
                      <SelectValue placeholder="Chọn lý do" />
                    </SelectTrigger>
                    <SelectContent>
                      {HR_REJECT_REASONS.map((reason) => (
                        <SelectItem key={reason} value={reason}>
                          {HR_REJECT_REASON_LABELS[reason]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>Sinh viên thấy lý do này.</FieldDescription>
                  )}
                </Field>
              )}
            />
            <Controller
              name="note"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${idPrefix}-note`}>Ghi chú</FieldLabel>
                  <Textarea
                    {...field}
                    value={field.value ?? ''}
                    id={`${idPrefix}-note`}
                    disabled={pending}
                    placeholder="Ví dụ: chưa có kinh nghiệm với SQL nâng cao"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>Chỉ HR và cán bộ Trung tâm đọc ghi chú này.</FieldDescription>
                  )}
                </Field>
              )}
            />
          </FieldGroup>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => change(false)}>
              Quay lại
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {pending ? 'Đang lưu' : 'Từ chối'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
