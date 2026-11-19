import { zodResolver } from '@hookform/resolvers/zod';
import {
  type BankQuestion,
  type CellCoverage,
  manualRejectReasonsFor,
  type RejectQuestionForm,
  RejectQuestionFormSchema,
} from '@srm/shared';
import { CircleAlert, CircleX, TriangleAlert } from 'lucide-react';
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
import { formatNumber } from '@/lib/format';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { applyServerFieldErrors } from '@/shared/forms/server-errors';
import { useRejectQuestion } from './api';
import { cellLabel, REJECT_REASON_LABELS } from './labels';

type FormInput = z.input<typeof RejectQuestionFormSchema>;

/** What the cell holds once this question is gone, said before CENTER confirms (US-4.11 AC-3). */
function CellAfterRejection({ cell, locked }: { cell: CellCoverage; locked: boolean }) {
  const left = cell.usable - 1;
  const name = cellLabel(cell.skill, cell.difficulty);
  if (locked && left < cell.needed) {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Phòng thi sẽ không rút được đề</AlertTitle>
        <AlertDescription>
          Ô {name} chỉ còn {formatNumber(left)} câu, ít hơn {formatNumber(cell.needed)} câu một đề rút. Sinh viên chưa
          làm bài sẽ không bắt đầu được bài test, và ngân hàng đã khóa nên không sinh câu thay thế.
        </AlertDescription>
      </Alert>
    );
  }
  if (left >= cell.min) return null;
  return (
    <Alert>
      <TriangleAlert />
      <AlertTitle>Ô {name} sẽ thiếu câu</AlertTitle>
      <AlertDescription>
        {locked
          ? `Còn ${formatNumber(left)} câu, dưới mức ${formatNumber(cell.min)} câu (3 lần số câu một đề): sinh viên dễ nhận đề trùng nhau hơn.`
          : `Còn ${formatNumber(left)} câu, dưới mức ${formatNumber(cell.min)} câu: bấm "Sinh câu còn thiếu" trước khi khóa ngân hàng.`}
      </AlertDescription>
    </Alert>
  );
}

/**
 * "Loại câu" (US-4.11 AC-3, DESIGN.md §6 `alert-dialog`): a reason among the Validator's codes for the question's
 * type and an optional note. Before locking the question becomes "Bị loại" and the next generation run writes another with the reason;
 * after locking it is no longer drawn and the bank's version rises. The dialog sends the question's `rowVersion`
 * from when it opened (LESSONS §25); a 409 closes it with a toast, and the list is read again.
 */
export function RejectQuestionDialog({
  jdId,
  question,
  label,
  locked,
  cell,
  disabled,
}: {
  jdId: number;
  question: BankQuestion;
  /** How the list names the question, e.g. "câu #1234". */
  label: string;
  locked: boolean;
  /** The question's cell of the blueprint; undefined for a cell the blueprint no longer has. */
  cell: CellCoverage | undefined;
  disabled: boolean;
}) {
  const reject = useRejectQuestion(jdId);
  const [open, setOpen] = useState(false);
  const [rowVersion, setRowVersion] = useState(question.rowVersion);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormInput, unknown, RejectQuestionForm>({
    resolver: zodResolver(RejectQuestionFormSchema),
    defaultValues: { note: '' },
    mode: 'onTouched',
  });
  const pending = form.formState.isSubmitting;
  const idPrefix = `question-${question.id}-reject`;

  function change(next: boolean) {
    if (pending) return;
    if (next) setRowVersion(question.rowVersion);
    else {
      form.reset();
      setError(null);
    }
    setOpen(next);
  }

  async function onSubmit(values: RejectQuestionForm) {
    setError(null);
    try {
      const result = await reject.mutateAsync({ questionId: question.id, ...values, rowVersion });
      change(false);
      toast.success(`Đã loại ${label}`, {
        description:
          result.status === 'RETIRED'
            ? `Câu không còn được rút cho bài test. Ngân hàng lên phiên bản ${formatNumber(result.bank.version)}.`
            : 'Câu không còn được tính vào độ phủ. Lần sinh câu sau, AI nhận lý do loại.',
      });
      if (result.status === 'RETIRED' && result.cell && result.cell.usable < result.cell.needed) {
        toast.warning('Phòng thi không rút được đề', {
          description: `Ô ${cellLabel(result.cell.skill, result.cell.difficulty)} còn ít câu hơn một đề rút.`,
        });
      }
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 409) {
        form.reset();
        setOpen(false);
        toast.error(apiErrorMessage(caught));
        return;
      }
      if (applyServerFieldErrors(caught, form.setError, ['reason', 'note'])) return;
      setError(apiErrorMessage(caught));
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto" disabled={disabled}>
          <CircleX data-icon="inline-start" />
          Loại câu
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
        <form noValidate onSubmit={(event) => void form.handleSubmit(onSubmit)(event)} className="flex flex-col gap-6">
          <AlertDialogHeader>
            <AlertDialogTitle>Loại {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {locked
                ? 'Ngân hàng đã khóa: câu ngừng được rút cho bài test và phiên bản ngân hàng tăng thêm một. Không sinh câu thay thế. Không hoàn tác được.'
                : 'Câu chuyển sang "Bị loại" và không còn được tính vào độ phủ. Lần "Sinh câu còn thiếu" sau, AI sinh câu khác cho ô này và nhận lý do loại. Không hoàn tác được.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cell && <CellAfterRejection cell={cell} locked={locked} />}
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Chưa loại được câu</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <Controller
              name="reason"
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
                      {manualRejectReasonsFor(question.type).map((reason) => (
                        <SelectItem key={reason} value={reason}>
                          {REJECT_REASON_LABELS[reason]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>AI nhận lý do này khi sinh câu thay thế.</FieldDescription>
                  )}
                </Field>
              )}
            />
            <Controller
              name="note"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${idPrefix}-note`}>Ghi chú (không bắt buộc)</FieldLabel>
                  <Textarea
                    {...field}
                    value={field.value ?? ''}
                    id={`${idPrefix}-note`}
                    disabled={pending}
                    placeholder="Ví dụ: đáp án đúng là C vì …"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : (
                    <FieldDescription>Chỉ cán bộ Trung tâm đọc ghi chú này.</FieldDescription>
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
              {pending ? 'Đang loại' : 'Loại câu'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
