import { zodResolver } from '@hookform/resolvers/zod';
import { type ManualGradeResult, manualGradeFormSchemaFor, type ManualGradingDetail, MANUAL_GRADE_NOTE_MAX } from '@srm/shared';
import { CircleAlert, Save } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { Controller, type Path, type UseFormSetError, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SheetClose, SheetFooter } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { formatNumber } from '@/lib/format';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { serverValidationIssues } from '@/shared/forms/server-errors';
import { useManualGrade } from './api';

type FormSchema = ReturnType<typeof manualGradeFormSchemaFor>;
type FormInput = z.input<FormSchema>;
type FormOutput = z.output<FormSchema>;

/** Server paths the form has a field for: a criterion's points, or the note. */
const FIELD_PATH = /^(criteria\.\d+\.points|note)$/;

/** Puts the 400 issues of the API on the matching inputs; false when none matched (DESIGN.md §8). */
function applyGradeErrors(error: unknown, setError: UseFormSetError<FormInput>): boolean {
  let applied = false;
  for (const issue of serverValidationIssues(error)) {
    if (!FIELD_PATH.test(issue.path)) continue;
    setError(issue.path as Path<FormInput>, { type: 'server', message: issue.message }, { shouldFocus: !applied });
    applied = true;
  }
  return applied;
}

/** The sum of the points entered so far; for display only, never an error of its own (LESSONS §26). */
function totalOf(criteria: readonly { points?: number }[] | undefined): number {
  return (criteria ?? []).reduce((sum, criterion) => {
    const points = criterion.points;
    return points !== undefined && Number.isFinite(points) ? sum + points : sum;
  }, 0);
}

/**
 * The grade of one answer (US-4.5 AC-3, AC-6, CONTEXT D54): a whole number for every rubric
 * criterion, checked by the shared schema the API uses, and an optional note. Code adds the points;
 * the total below is only shown. Saving asks first, since the score is final: a change after that
 * goes through an appeal. The row version sent is that of the detail the form was filled from
 * (LESSONS §25); a 409 closes the dialog and reloads the answer. `children` are the answer's
 * sections, shown above the inputs in the same scrolling area.
 */
export function ManualGradeForm({
  detail,
  onSaved,
  children,
}: {
  detail: ManualGradingDetail;
  onSaved: (result: ManualGradeResult) => void;
  children: ReactNode;
}) {
  const schema = useMemo(
    () => manualGradeFormSchemaFor(detail.rubric.map((criterion) => ({ criterion: criterion.criterion, max_points: criterion.maxPoints }))),
    [detail.rubric],
  );
  const [rowVersion] = useState(detail.rowVersion);
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      criteria: detail.rubric.map((_, index) => ({ index, points: Number.NaN })),
      note: '',
    },
    mode: 'onTouched',
  });
  const grade = useManualGrade(detail.answerId);
  const [confirming, setConfirming] = useState<FormOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const criteria = useWatch({ control: form.control, name: 'criteria' });
  const total = totalOf(criteria);
  const pending = grade.isPending;

  async function confirm(values: FormOutput) {
    setError(null);
    try {
      const result = await grade.mutateAsync({
        rowVersion,
        criteria: values.criteria.map(({ index, points }) => ({ index, points })),
        note: values.note ?? null,
      });
      setConfirming(null);
      onSaved(result);
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 409) {
        setConfirming(null);
        toast.error(apiErrorMessage(caught));
        return;
      }
      if (applyGradeErrors(caught, form.setError)) {
        setConfirming(null);
        return;
      }
      setError(apiErrorMessage(caught));
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void form.handleSubmit((values) => setConfirming(values))(event)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4">
        {children}
        <FieldSet>
          <FieldLegend>Điểm theo tiêu chí</FieldLegend>
          <FieldDescription>Nhập số nguyên cho từng tiêu chí của rubric. Hệ thống tự cộng thành điểm của câu.</FieldDescription>
          <FieldGroup>
            {detail.rubric.map((criterion, index) => {
              const id = `grade-${detail.answerId}-${index}`;
              return (
                <Controller
                  key={index}
                  name={`criteria.${index}.points`}
                  control={form.control}
                  render={({ field, fieldState }) => {
                    const value = field.value as number | undefined;
                    return (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={id} className="break-words">
                          Tiêu chí {index + 1}: {criterion.criterion}
                        </FieldLabel>
                        <Input
                          id={id}
                          name={field.name}
                          ref={field.ref}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={criterion.maxPoints}
                          step={1}
                          // An emptied input becomes NaN, which the shared schema reports as missing.
                          value={value === undefined || Number.isNaN(value) ? '' : value}
                          onChange={(event) =>
                            field.onChange(event.target.value === '' ? Number.NaN : event.target.valueAsNumber)
                          }
                          onBlur={field.onBlur}
                          aria-invalid={fieldState.invalid}
                          disabled={pending}
                          className="w-28 tabular-nums"
                        />
                        <FieldDescription>Tối đa {formatNumber(criterion.maxPoints)} điểm</FieldDescription>
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    );
                  }}
                />
              );
            })}
            <p className="text-sm font-medium tabular-nums" aria-live="polite">
              Tổng: {formatNumber(total)} / {formatNumber(detail.maxPoints)} điểm
            </p>
            <Controller
              name="note"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`grade-${detail.answerId}-note`}>Ghi chú (không bắt buộc)</FieldLabel>
                  <Textarea
                    id={`grade-${detail.answerId}-note`}
                    {...field}
                    value={field.value ?? ''}
                    rows={3}
                    maxLength={MANUAL_GRADE_NOTE_MAX}
                    aria-invalid={fieldState.invalid}
                    disabled={pending}
                  />
                  <FieldDescription>Chỉ cán bộ Trung tâm xem được; sinh viên chỉ thấy tổng điểm của câu.</FieldDescription>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
        </FieldSet>
      </div>
      <SheetFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button type="submit" disabled={pending}>
          <Save data-icon="inline-start" />
          Lưu điểm
        </Button>
        <SheetClose asChild>
          <Button type="button" variant="outline" disabled={pending}>
            Đóng
          </Button>
        </SheetClose>
      </SheetFooter>
      <AlertDialog
        open={confirming !== null}
        onOpenChange={(next) => {
          if (pending || next) return;
          setConfirming(null);
          setError(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lưu điểm câu này?</AlertDialogTitle>
            <AlertDialogDescription>
              Câu được {formatNumber(totalOf(confirming?.criteria))} / {formatNumber(detail.maxPoints)} điểm. Đây là điểm
              cuối cùng của câu; sau khi lưu, điểm chỉ sửa được qua phúc khảo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Chưa lưu được điểm</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Hủy</AlertDialogCancel>
            <Button type="button" onClick={() => confirming !== null && void confirm(confirming)} disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {pending ? 'Đang lưu' : 'Lưu điểm'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
