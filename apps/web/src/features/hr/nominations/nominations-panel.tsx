import { NOMINATION_STATUS_LABELS, type JdNominationList, type NominationListItem } from '@srm/shared';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, CircleAlert, Clock, FileSearch, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { IconBadge } from '@/shared/ui/icon-badge';
import { useJdNominations, useRequestSupplement } from './api';
import { HR_STATUS_LABELS, NOMINATION_STATUS_STYLE, SUPPLEMENT_BLOCK_TEXT } from './labels';
import { NominationSheet } from './nomination-sheet';

/** `?nomination=` keeps the open nomination across a reload or a shared link. */
const NOMINATION_PARAM = 'nomination';

const score = (value: number | null) => (value === null ? '–' : formatNumber(value, 2));

function SortButton({ label, sorted, onClick }: { label: string; sorted: false | 'asc' | 'desc'; onClick: () => void }) {
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <Button variant="ghost" size="sm" className="-ml-2" onClick={onClick}>
      {label}
      <Icon data-icon="inline-end" aria-hidden="true" />
      <span className="sr-only">
        {sorted === 'asc' ? '(tăng dần)' : sorted === 'desc' ? '(giảm dần)' : '(theo thứ tự đề cử)'}
      </span>
    </Button>
  );
}

/** The deadline, with "Quá hạn" while HR has not answered past it (AC-10); `now` is when the page loaded. */
function DueCell({ item, now }: { item: NominationListItem; now: number }) {
  const overdue = item.status === 'NOMINATED' && Date.parse(item.reviewDueAt) <= now;
  return (
    <span className="flex flex-col">
      <span className="tabular-nums">{formatDateTime(item.reviewDueAt)}</span>
      {item.status === 'NOMINATED' && (
        <span className={overdue ? 'flex items-center gap-1 text-destructive' : 'text-muted-foreground'}>
          {overdue && <Clock className="size-3.5" aria-hidden="true" />}
          {overdue ? 'Quá hạn' : formatRelative(item.reviewDueAt)}
        </span>
      )}
    </span>
  );
}

function useColumns(onOpen: (id: number) => void, now: number): ColumnDef<NominationListItem>[] {
  const scoreColumn = (key: 'sFinal' | 'sTest' | 'sCv', label: string): ColumnDef<NominationListItem> => ({
    id: key,
    accessorFn: (item) => item[key] ?? -1,
    header: ({ column }) => (
      <SortButton label={label} sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() !== 'desc')} />
    ),
    cell: ({ row }) => <span className="tabular-nums">{score(row.original[key])}</span>,
    sortDescFirst: true,
  });
  return [
    {
      id: 'order',
      header: '#',
      enableSorting: false,
      cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.index + 1}</span>,
    },
    {
      id: 'student',
      header: 'Sinh viên',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="flex min-w-0 max-w-56 flex-col">
          <span className="truncate font-medium">{row.original.student.fullName}</span>
          <span className="text-muted-foreground tabular-nums">{row.original.student.studentCode}</span>
        </span>
      ),
    },
    scoreColumn('sFinal', 'S_final'),
    scoreColumn('sTest', 'S_test'),
    scoreColumn('sCv', 'S_cv'),
    {
      id: 'status',
      header: 'Trạng thái',
      enableSorting: false,
      cell: ({ row }) => (
        <IconBadge style={NOMINATION_STATUS_STYLE[row.original.status]}>
          {HR_STATUS_LABELS[row.original.status] ?? NOMINATION_STATUS_LABELS[row.original.status]}
        </IconBadge>
      ),
    },
    { id: 'due', header: 'Hạn phản hồi', enableSorting: false, cell: ({ row }) => <DueCell item={row.original} now={now} /> },
    {
      id: 'actions',
      header: () => <span className="sr-only">Thao tác</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <Button variant="outline" size="sm" onClick={() => onOpen(row.original.nominationId)}>
          <FileSearch data-icon="inline-start" />
          Xem hồ sơ<span className="sr-only"> của {row.original.student.fullName}</span>
        </Button>
      ),
    },
  ];
}

/** "Yêu cầu bổ sung hồ sơ" (GĐ8 step 3, AC-9): on while fewer were invited than the quota. */
function SupplementButton({ list, readOnly }: { list: JdNominationList; readOnly: boolean }) {
  const request = useRequestSupplement(list.jd.jdId);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { blockedBy, requestedAt } = list.supplement;
  const pending = request.isPending;
  const noteError = touched && note.trim() === '' ? 'Nhập ghi chú' : null;
  const reason =
    blockedBy === 'ALREADY_REQUESTED' && requestedAt
      ? `Đã gửi yêu cầu bổ sung hồ sơ lúc ${formatDateTime(requestedAt)}.`
      : blockedBy && SUPPLEMENT_BLOCK_TEXT[blockedBy];

  function change(next: boolean) {
    if (pending) return;
    if (!next) {
      setNote('');
      setTouched(false);
      setError(null);
    }
    setOpen(next);
  }

  async function submit() {
    setTouched(true);
    if (note.trim() === '') return;
    setError(null);
    try {
      await request.mutateAsync(note.trim());
      change(false);
      toast.success('Đã gửi yêu cầu bổ sung hồ sơ', { description: 'Trung tâm nhận được yêu cầu cùng ghi chú.' });
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 409) {
        setOpen(false);
        toast.error(apiErrorMessage(caught));
        return;
      }
      setError(apiErrorMessage(caught));
    }
  }

  if (readOnly) return null;
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      {reason && <p className="text-sm text-muted-foreground">{reason}</p>}
      <AlertDialog open={open} onOpenChange={change}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" disabled={blockedBy !== null} className="w-full sm:w-auto">
            <UserPlus data-icon="inline-start" />
            Yêu cầu bổ sung hồ sơ
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <form
            noValidate
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Yêu cầu bổ sung hồ sơ?</AlertDialogTitle>
              <AlertDialogDescription>
                Đã mời phỏng vấn {formatNumber(list.invitedCount)}/{formatNumber(list.jd.quota)} chỉ tiêu. Trung tâm nhận
                yêu cầu và xem xét ở vòng bổ sung kế tiếp. Mỗi vòng gửi được một lần.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>Chưa gửi được yêu cầu</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Field data-invalid={noteError !== null}>
              <FieldLabel htmlFor={`supplement-${list.jd.jdId}-note`}>Ghi chú</FieldLabel>
              <Textarea
                id={`supplement-${list.jd.jdId}-note`}
                value={note}
                disabled={pending}
                maxLength={1000}
                placeholder="Ví dụ: cần thêm hồ sơ có kinh nghiệm React"
                aria-invalid={noteError !== null}
                onChange={(event) => setNote(event.target.value)}
                onBlur={() => setTouched(true)}
              />
              {noteError ? (
                <FieldError>{noteError}</FieldError>
              ) : (
                <FieldDescription>Nói rõ JD còn cần hồ sơ thế nào.</FieldDescription>
              )}
            </Field>
            <AlertDialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => change(false)}>
                Quay lại
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Spinner data-icon="inline-start" />}
                {pending ? 'Đang gửi' : 'Gửi yêu cầu'}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NominationTable({ items, onOpen }: { items: NominationListItem[]; onOpen: (id: number) => void }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [now] = useState(() => Date.now());
  const columns = useColumns(onOpen, now);
  // The compiler leaves this component unmemoized; `table` never leaves it, so nothing goes stale.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: items,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead
                key={header.id}
                aria-sort={
                  header.column.getIsSorted() === 'asc'
                    ? 'ascending'
                    : header.column.getIsSorted() === 'desc'
                      ? 'descending'
                      : undefined
                }
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * "Đề cử" of a JD in the HR portal (GĐ8, FR-28, FR-29, US-5.3 AC-12): the nominations of every
 * published round, best S_final first with the tie-breaks of US-5.1 (the table may sort by a score
 * column), the deadline of each, and the sheet of one nomination (`?nomination=`). Nothing ranks
 * or decides by AI (BR-13).
 */
export function NominationsPanel({ jdId, readOnly }: { jdId: number; readOnly: boolean }) {
  const list = useJdNominations(jdId);
  const [params, setParams] = useSearchParams();
  const opened = Number(params.get(NOMINATION_PARAM));
  const nominationId = Number.isInteger(opened) && opened > 0 ? opened : null;

  function open(id: number | null) {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (id === null) updated.delete(NOMINATION_PARAM);
        else updated.set(NOMINATION_PARAM, String(id));
        return updated;
      },
      { replace: id === null },
    );
  }

  let body;
  if (list.isPending) {
    body = (
      <div className="flex flex-col gap-2" aria-busy="true">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  } else if (list.isError) {
    body = (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Không tải được danh sách đề cử</AlertTitle>
        <AlertDescription>{apiErrorMessage(list.error)}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
            Thử lại
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (list.data.items.length === 0) {
    body = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Users />
          </EmptyMedia>
          <EmptyTitle>Chưa có sinh viên được đề cử</EmptyTitle>
          <EmptyDescription>Danh sách hiện khi Trung tâm công bố vòng phân bổ có đề cử vào JD này.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    body = <NominationTable items={list.data.items} onOpen={open} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Danh sách đề cử</CardTitle>
        <CardDescription>
          Sắp theo S_final; bằng điểm thì theo S_test, S_cv, GPA, thời điểm nộp bài.
          {list.data &&
            ` Đã mời phỏng vấn ${formatNumber(list.data.invitedCount)}/${formatNumber(list.data.jd.quota)} chỉ tiêu.`}
        </CardDescription>
        {list.data && (
          <CardAction>
            <SupplementButton list={list.data} readOnly={readOnly} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>{body}</CardContent>
      <NominationSheet jdId={jdId} nominationId={nominationId} readOnly={readOnly} onClose={() => open(null)} />
    </Card>
  );
}
