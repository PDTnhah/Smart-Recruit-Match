import { zodResolver } from '@hookform/resolvers/zod';
import {
  type AllocationJdView,
  type NominationAdjustment,
  type NominationAdjustmentForm,
  NominationAdjustmentFormSchema,
  NominationTargetFormSchema,
} from '@srm/shared';
import { CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { formatNumber } from '@/lib/format';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { applyServerFieldErrors } from '@/shared/forms/server-errors';
import { useAdjustNominations } from './api';

/** What the center is about to change: a student to add, or a nomination to move or remove. */
export type AdjustTarget =
  | { op: 'add'; studentId: number; studentLabel: string }
  | { op: 'move' | 'remove'; nominationId: number; studentLabel: string; jdId: number; jdTitle: string };

const TITLES = { add: 'Thêm đề cử', move: 'Chuyển đề cử', remove: 'Bỏ đề cử' } as const;
const SUBMIT = { add: 'Thêm đề cử', move: 'Chuyển', remove: 'Bỏ đề cử' } as const;

/** Codes meaning the draft on screen is no longer the one to adjust. */
const STALE_DRAFT: ReadonlySet<string> = new Set(['ROW_VERSION_CONFLICT', 'ALLOCATION_ROUND_PUBLISHED', 'CAMPAIGN_PHASE_MISMATCH']);

function describe(target: AdjustTarget): string {
  switch (target.op) {
    case 'add':
      return `Đề cử ${target.studentLabel} vào một JD trong nguyện vọng của sinh viên. JD phải còn suất và cặp phải đạt điều kiện đề cử.`;
    case 'move':
      return `Chuyển ${target.studentLabel} từ "${target.jdTitle}" sang một JD khác trong nguyện vọng của sinh viên. JD mới phải còn suất.`;
    case 'remove':
      return `Bỏ ${target.studentLabel} khỏi "${target.jdTitle}". Sinh viên về danh sách chưa có đề cử của vòng này.`;
  }
}

/**
 * One manual change of the draft (US-5.2 AC-8, BR-10, DESIGN.md §6 `alert-dialog`): the reason is
 * required and goes to the audit log. The dialog sends the round's `rowVersion` from when it opened
 * (LESSONS §25); a 409 closes it with a toast and the draft is read again. A 422 (BR-07, BR-09)
 * stays inside the dialog.
 */
export function AdjustNominationDialog({
  campaignId,
  roundId,
  rowVersion,
  jds,
  target,
  onClose,
}: {
  campaignId: number;
  roundId: number;
  rowVersion: number;
  jds: readonly AllocationJdView[];
  /** The caller mounts one dialog per target (`key`), so the row version is the one of when it opened. */
  target: AdjustTarget;
  onClose: () => void;
}) {
  const adjust = useAdjustNominations(campaignId, roundId);
  const [openedVersion] = useState(rowVersion);
  const [error, setError] = useState<string | null>(null);
  const needsJd = target.op !== 'remove';
  const form = useForm<NominationAdjustmentForm>({
    resolver: zodResolver(needsJd ? NominationTargetFormSchema : NominationAdjustmentFormSchema),
    defaultValues: { jdId: '', reason: '' },
    mode: 'onTouched',
  });
  const pending = form.formState.isSubmitting;

  function close() {
    if (pending) return;
    onClose();
  }

  async function onSubmit(values: NominationAdjustmentForm) {
    setError(null);
    const operation: NominationAdjustment =
      target.op === 'add'
        ? { op: 'add', studentId: target.studentId, jdId: Number(values.jdId), reason: values.reason }
        : target.op === 'move'
          ? { op: 'move', nominationId: target.nominationId, jdId: Number(values.jdId), reason: values.reason }
          : { op: 'remove', nominationId: target.nominationId, reason: values.reason };
    try {
      await adjust.mutateAsync({ rowVersion: openedVersion, operations: [operation] });
      onClose();
      toast.success('Đã lưu điều chỉnh', { description: 'Lý do được ghi vào nhật ký của vòng phân bổ.' });
    } catch (caught) {
      // The draft moved on (another staff member, a publish): close and show the current one. Other
      // refusals (BR-07, BR-08, BR-09) stay in the dialog with what was typed.
      if (caught instanceof ApiRequestError && STALE_DRAFT.has(caught.body?.code ?? '')) {
        onClose();
        toast.error(apiErrorMessage(caught));
        return;
      }
      if (applyServerFieldErrors(caught, form.setError, ['reason'])) return;
      setError(apiErrorMessage(caught));
    }
  }

  const choices = target.op === 'move' ? jds.filter((jd) => jd.jdId !== target.jdId) : jds;
  return (
    <AlertDialog open onOpenChange={(open) => !open && close()}>
      <AlertDialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
        <form noValidate onSubmit={(event) => void form.handleSubmit(onSubmit)(event)} className="flex flex-col gap-6">
          <AlertDialogHeader>
            <AlertDialogTitle>{TITLES[target.op]}</AlertDialogTitle>
            <AlertDialogDescription>{describe(target)}</AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Chưa lưu được điều chỉnh</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            {needsJd && (
              <Controller
                name="jdId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="adjust-jd">JD</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                      <SelectTrigger
                        id="adjust-jd"
                        ref={field.ref}
                        className="w-full"
                        aria-invalid={fieldState.invalid}
                        onBlur={field.onBlur}
                      >
                        <SelectValue placeholder="Chọn JD" />
                      </SelectTrigger>
                      <SelectContent>
                        {choices.map((jd) => (
                          <SelectItem key={jd.jdId} value={String(jd.jdId)} textValue={jd.title}>
                            <span className="flex flex-col">
                              <span className="break-words">{jd.title}</span>
                              <span className="text-xs text-muted-foreground">
                                {jd.companyName} · {formatNumber(jd.nominated)}/{formatNumber(jd.capacity)} đề cử
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldState.invalid ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : (
                      <FieldDescription>Hệ thống từ chối JD không thuộc nguyện vọng hợp lệ của sinh viên.</FieldDescription>
                    )}
                  </Field>
                )}
              />
            )}
            <Controller
              name="reason"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="adjust-reason">Lý do</FieldLabel>
                  <Textarea
                    {...field}
                    id="adjust-reason"
                    disabled={pending}
                    placeholder="Ví dụ: doanh nghiệp báo sinh viên đã có nơi thực tập khác"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>Bắt buộc. Lý do được lưu vào nhật ký (BR-10).</FieldDescription>
                  )}
                </Field>
              )}
            />
          </FieldGroup>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={close}>
              Quay lại
            </Button>
            <Button type="submit" variant={target.op === 'remove' ? 'destructive' : 'default'} disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {pending ? 'Đang lưu' : SUBMIT[target.op]}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
