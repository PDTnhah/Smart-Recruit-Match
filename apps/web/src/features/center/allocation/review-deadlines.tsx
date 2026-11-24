import { REVIEW_EXTENSION_REASON_MAX, type ReviewDeadline } from '@srm/shared';
import { CalendarClock, CircleAlert, Clock } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { DeadlineField } from '@/features/center/campaigns/deadline-field';
import { formatDateTime, formatNumber } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { useExtendReviewDeadline, useReviewDeadlines } from './api';

/**
 * "Gia hạn" (US-5.3 AC-10): a later deadline for one JD's nominations of the round, with a reason
 * (audited). The next reminder and overdue notice use it.
 */
function ExtendDialog({ roundId, deadline, onClose }: { roundId: number; deadline: ReviewDeadline; onClose: () => void }) {
  const extend = useExtendReviewDeadline(roundId);
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = extend.isPending;
  // When the dialog opened; the API checks against its own clock again.
  const [openedAt] = useState(() => Date.now());
  const current = Date.parse(deadline.dueAt);
  const earliest = Math.max(current, openedAt);
  const tooEarly = dueAt !== null && Date.parse(dueAt) <= earliest;
  const dueError = !submitted
    ? null
    : dueAt === null
      ? 'Chọn hạn mới'
      : tooEarly
        ? 'Hạn mới phải sau hạn hiện tại và sau thời điểm này'
        : null;
  const reasonError = submitted && reason.trim() === '' ? 'Nhập lý do gia hạn' : null;
  const idPrefix = `extend-${roundId}-${deadline.jdId}`;

  async function submit() {
    setSubmitted(true);
    if (dueAt === null || tooEarly || reason.trim() === '') return;
    setError(null);
    try {
      await extend.mutateAsync({ jdId: deadline.jdId, dueAt, reason: reason.trim() });
      onClose();
      toast.success('Đã gia hạn', { description: `"${deadline.jdTitle}": hạn mới ${formatDateTime(dueAt)}.` });
    } catch (caught) {
      setError(apiErrorMessage(caught));
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">Gia hạn cho "{deadline.jdTitle}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deadline.companyName} còn {formatNumber(deadline.pendingCount)} đề cử chưa có quyết định. Hạn hiện tại:{' '}
              {formatDateTime(deadline.dueAt)}. HR được nhắc lại 2 ngày làm việc trước hạn mới.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Chưa gia hạn được</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <Field data-invalid={dueError !== null}>
              <FieldLabel htmlFor={`${idPrefix}-due`}>Hạn mới</FieldLabel>
              <DeadlineField
                id={`${idPrefix}-due`}
                label="hạn mới"
                value={dueAt}
                onChange={setDueAt}
                invalid={dueError !== null}
                disabled={pending}
                notBefore={new Date(earliest)}
              />
              {dueError && <FieldError>{dueError}</FieldError>}
            </Field>
            <Field data-invalid={reasonError !== null}>
              <FieldLabel htmlFor={`${idPrefix}-reason`}>Lý do</FieldLabel>
              <Textarea
                id={`${idPrefix}-reason`}
                value={reason}
                maxLength={REVIEW_EXTENSION_REASON_MAX}
                disabled={pending}
                placeholder="Ví dụ: HR đang đi công tác, xin thêm 3 ngày"
                aria-invalid={reasonError !== null}
                onChange={(event) => setReason(event.target.value)}
              />
              {reasonError ? <FieldError>{reasonError}</FieldError> : <FieldDescription>Ghi vào nhật ký.</FieldDescription>}
            </Field>
          </FieldGroup>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Quay lại
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {pending ? 'Đang lưu' : 'Gia hạn'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DueCell({ deadline, now }: { deadline: ReviewDeadline; now: number }) {
  const overdue = deadline.pendingCount > 0 && Date.parse(deadline.dueAt) <= now;
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="tabular-nums">{formatDateTime(deadline.dueAt)}</span>
      <span className="flex flex-wrap gap-1">
        {overdue && (
          <span className="flex items-center gap-1 text-destructive">
            <Clock className="size-3.5" aria-hidden="true" />
            Quá hạn
          </span>
        )}
        {deadline.extended && <Badge variant="outline">Đã gia hạn</Badge>}
      </span>
    </span>
  );
}

/**
 * HR's deadlines of a published round (GĐ8 step 4, US-5.3 AC-10): per JD, how many nominations are
 * still waiting and until when; past it, the center contacts the company or extends. Shown under
 * the round on "Phân bổ".
 */
export function ReviewDeadlinesCard({ roundId, editable }: { roundId: number; editable: boolean }) {
  const deadlines = useReviewDeadlines(roundId);
  const [extending, setExtending] = useState<ReviewDeadline | null>(null);
  const [now] = useState(() => Date.now());

  let body;
  if (deadlines.isPending) {
    body = (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  } else if (deadlines.isError) {
    body = (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Không tải được hạn phản hồi</AlertTitle>
        <AlertDescription>{apiErrorMessage(deadlines.error)}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void deadlines.refetch()}>
            Thử lại
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (deadlines.data.length === 0) {
    body = <p className="text-sm text-muted-foreground">Vòng này không có đề cử nào.</p>;
  } else {
    body = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>JD</TableHead>
            <TableHead>Chưa quyết định</TableHead>
            <TableHead>Hạn phản hồi</TableHead>
            <TableHead>
              <span className="sr-only">Thao tác</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deadlines.data.map((deadline) => (
            <TableRow key={deadline.jdId}>
              <TableCell>
                <span className="flex max-w-64 min-w-0 flex-col">
                  <span className="truncate font-medium">{deadline.jdTitle}</span>
                  <span className="truncate text-muted-foreground">{deadline.companyName}</span>
                </span>
              </TableCell>
              <TableCell className="tabular-nums">
                {formatNumber(deadline.pendingCount)}/{formatNumber(deadline.nominationCount)}
              </TableCell>
              <TableCell>
                <DueCell deadline={deadline} now={now} />
              </TableCell>
              <TableCell className="text-right">
                {editable && deadline.pendingCount > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setExtending(deadline)}>
                    <CalendarClock data-icon="inline-start" />
                    Gia hạn<span className="sr-only"> cho {deadline.jdTitle}</span>
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hạn phản hồi của HR</CardTitle>
        <CardDescription>
          SLA_HR ngày làm việc (thứ Hai–thứ Sáu) từ lúc công bố. HR được nhắc 2 ngày làm việc trước hạn; quá hạn thì HR và
          Trung tâm nhận thông báo. Hết hạn không tự từ chối sinh viên.
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
      {extending && (
        <ExtendDialog key={extending.jdId} roundId={roundId} deadline={extending} onClose={() => setExtending(null)} />
      )}
    </Card>
  );
}
