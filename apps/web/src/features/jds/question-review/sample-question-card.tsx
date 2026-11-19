import { zodResolver } from '@hookform/resolvers/zod';
import { type QuestionErrorReportForm, QuestionErrorReportFormSchema, type SampleQuestion } from '@srm/shared';
import { Check, CircleAlert, CircleCheck, CircleX, Flag } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { DIFFICULTY_LABELS, QUESTION_TYPE_LABELS } from '@/features/center/question-bank/labels';
import { formatDateTime } from '@/lib/format';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { applyServerFieldErrors } from '@/shared/forms/server-errors';
import { IconBadge, type IconBadgeStyle } from '@/shared/ui/icon-badge';
import { useSubmitQuestionReview } from './api';
import { QuestionBody, QuestionText } from './question-body';

const USABLE: ReadonlySet<SampleQuestion['status']> = new Set(['DRAFT', 'VALIDATED']);

/** DESIGN.md §6 › badge: where the question stands after review. */
const STANDING: Readonly<Record<'OK' | 'RETIRED' | 'REJECTED', { label: string; style: IconBadgeStyle }>> = {
  OK: { label: 'Đã xác nhận đúng', style: { variant: 'default', icon: CircleCheck } },
  RETIRED: { label: 'Đã loại', style: { variant: 'outline', icon: CircleX } },
  // The Validator or, since US-4.11, CENTER by hand: the bank's question list says which.
  REJECTED: { label: 'Bị loại', style: { variant: 'outline', icon: CircleX } },
};

function Standing({ question }: { question: SampleQuestion }) {
  if (question.status === 'RETIRED' || question.status === 'REJECTED') {
    const { label, style } = STANDING[question.status];
    return <IconBadge style={style}>{label}</IconBadge>;
  }
  if (question.review?.verdict === 'OK') return <IconBadge style={STANDING.OK.style}>{STANDING.OK.label}</IconBadge>;
  return <Badge variant="outline">Chưa duyệt</Badge>;
}

function ReviewNote({ review }: { review: NonNullable<SampleQuestion['review']> }) {
  const who = review.mine ? 'tài khoản này' : 'người duyệt khác';
  if (review.verdict === 'OK') {
    return (
      <p className="text-sm text-muted-foreground">
        Xác nhận đúng bởi {who} lúc {formatDateTime(review.reviewedAt)}.
      </p>
    );
  }
  return (
    <Alert>
      <Flag />
      <AlertTitle>
        Báo lỗi bởi {who} lúc {formatDateTime(review.reviewedAt)}
      </AlertTitle>
      <AlertDescription>
        <QuestionText>{review.reason ?? ''}</QuestionText>
      </AlertDescription>
    </Alert>
  );
}

type ReportInput = z.input<typeof QuestionErrorReportFormSchema>;

/**
 * "Báo lỗi" (US-4.9 AC-3, AC-4): a required reason, then the question is retired. The dialog sends the
 * `rowVersion` the question had when it opened (LESSONS §25); a 409 closes it and reloads the sample.
 */
function ReportErrorDialog({ jdId, question, number }: { jdId: number; question: SampleQuestion; number: number }) {
  const submit = useSubmitQuestionReview(jdId);
  const [open, setOpen] = useState(false);
  const [rowVersion, setRowVersion] = useState(question.rowVersion);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ReportInput, unknown, QuestionErrorReportForm>({
    resolver: zodResolver(QuestionErrorReportFormSchema),
    defaultValues: { reason: '' },
    mode: 'onTouched',
  });
  const pending = form.formState.isSubmitting;
  const fieldId = `question-${question.id}-error-reason`;

  function change(next: boolean) {
    if (pending) return;
    if (next) setRowVersion(question.rowVersion);
    else {
      form.reset();
      setError(null);
    }
    setOpen(next);
  }

  async function onSubmit({ reason }: QuestionErrorReportForm) {
    setError(null);
    try {
      await submit.mutateAsync({ questionId: question.id, verdict: 'ERROR', reason, rowVersion });
      change(false);
      toast.success(`Đã báo lỗi câu ${number}`, { description: 'Câu đã bị loại khỏi ngân hàng câu hỏi.' });
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 409) {
        form.reset();
        setOpen(false);
        toast.error(apiErrorMessage(caught));
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
          <Flag data-icon="inline-start" />
          Báo lỗi
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
        <form noValidate onSubmit={(event) => void form.handleSubmit(onSubmit)(event)} className="flex flex-col gap-6">
          <AlertDialogHeader>
            <AlertDialogTitle>Báo lỗi câu {number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Câu bị loại khỏi ngân hàng ngay khi gửi và không được rút cho sinh viên nữa. Không hoàn tác được. Nếu
              ngân hàng đã khóa, phiên bản của ngân hàng tăng thêm một.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Chưa gửi được báo lỗi</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Controller
            name="reason"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={fieldId}>Lý do</FieldLabel>
                <Textarea
                  {...field}
                  id={fieldId}
                  autoFocus
                  disabled={pending}
                  placeholder="Ví dụ: đáp án đúng là C vì …"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : (
                  <FieldDescription>Trung tâm đọc lý do này khi rà ngân hàng câu hỏi.</FieldDescription>
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
              {pending ? 'Đang gửi' : 'Báo lỗi và loại câu'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ConfirmOkButton({ jdId, question, number }: { jdId: number; question: SampleQuestion; number: number }) {
  const submit = useSubmitQuestionReview(jdId);

  async function confirm() {
    try {
      await submit.mutateAsync({ questionId: question.id, verdict: 'OK' });
      toast.success(`Đã xác nhận câu ${number} đúng`);
    } catch (caught) {
      toast.error(apiErrorMessage(caught));
    }
  }

  return (
    <Button variant="outline" disabled={submit.isPending} onClick={() => void confirm()}>
      {submit.isPending ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
      Xác nhận đúng
    </Button>
  );
}

/**
 * One question of the review sample (US-4.9 AC-6): the stem, the options with the correct one highlighted
 * and labelled, the explanation, or the model answer and rubric of an essay; the latest review; and the
 * actions while the question is usable and the reviewer may still act.
 */
export function SampleQuestionCard({
  jdId,
  question,
  number,
  readOnly,
}: {
  jdId: number;
  question: SampleQuestion;
  /** Place in the sample, from 1. */
  number: number;
  readOnly: boolean;
}) {
  const actionable = !readOnly && USABLE.has(question.status);
  const confirmedByMe = question.review?.verdict === 'OK' && question.review.mine;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Câu {number}</CardTitle>
        <CardDescription className="break-words">
          {QUESTION_TYPE_LABELS[question.type]} · {question.skill} · {DIFFICULTY_LABELS[question.difficulty]}
        </CardDescription>
        <CardAction>
          <Standing question={question} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <QuestionBody question={question} />
        {question.review && <ReviewNote review={question.review} />}
      </CardContent>
      {actionable && (
        <CardFooter className="flex flex-wrap justify-end gap-2">
          {!confirmedByMe && <ConfirmOkButton jdId={jdId} question={question} number={number} />}
          <ReportErrorDialog jdId={jdId} question={question} number={number} />
        </CardFooter>
      )}
    </Card>
  );
}
