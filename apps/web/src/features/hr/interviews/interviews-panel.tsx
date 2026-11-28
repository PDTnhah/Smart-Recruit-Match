import {
  INTERVIEW_MODE_LABELS,
  INTERVIEW_RESULT_LABELS,
  INTERVIEW_STATUS_LABELS,
  type JdInterviewList,
  NOMINATION_STATUS_LABELS,
  OFFER_STATUS_LABELS,
} from '@srm/shared';
import { CalendarPlus, CircleAlert, ClipboardCheck, PencilLine, Users } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NOMINATION_STATUS_STYLE } from '@/features/hr/nominations/labels';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { IconBadge } from '@/shared/ui/icon-badge';
import { useJdInterviews } from './api';
import { InterviewResultDialog, InterviewSlotSheet } from './interview-dialogs';
import { INTERVIEW_STATUS_STYLE, NOT_SCHEDULED_STYLE, OFFER_STATUS_STYLE } from './labels';

type Item = JdInterviewList['items'][number];

type Open = { kind: 'slot' | 'result'; nominationId: number } | null;

function Slots({ slots }: { slots: JdInterviewList['slots'] }) {
  const entries = [
    { label: 'Chỉ tiêu', value: slots.quota },
    { label: 'Đã nhận', value: slots.accepted },
    { label: 'Chờ trả lời', value: slots.passed },
    { label: 'Dự bị', value: slots.reserve },
  ];
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {entries.map((entry) => (
        <div key={entry.label} className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">{entry.label}</dt>
          <dd className="text-xl font-semibold tabular-nums">{formatNumber(entry.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function InterviewCell({ item }: { item: Item }) {
  const { interview } = item;
  if (!interview) return <IconBadge style={NOT_SCHEDULED_STYLE}>Chưa có lịch</IconBadge>;
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="tabular-nums">{formatDateTime(interview.scheduledAt)}</span>
      <span className="text-muted-foreground break-words">
        {INTERVIEW_MODE_LABELS[interview.mode]} · {interview.location}
      </span>
      <span>
        <IconBadge style={INTERVIEW_STATUS_STYLE[interview.status]}>
          {interview.status === 'DONE' && interview.result ? INTERVIEW_RESULT_LABELS[interview.result] : INTERVIEW_STATUS_LABELS[interview.status]}
        </IconBadge>
      </span>
      {interview.status === 'RESCHEDULE_REQUESTED' && interview.rescheduleNote && (
        <span className="text-muted-foreground break-words whitespace-pre-wrap">Lý do: {interview.rescheduleNote}</span>
      )}
    </span>
  );
}

function OfferCell({ item }: { item: Item }) {
  const { offer } = item;
  if (!offer) return <span className="text-muted-foreground">–</span>;
  return (
    <span className="flex flex-col gap-1">
      <span>
        <IconBadge style={OFFER_STATUS_STYLE[offer.status]}>{OFFER_STATUS_LABELS[offer.status]}</IconBadge>
      </span>
      {offer.status === 'PENDING' ? (
        <span className="text-muted-foreground tabular-nums">
          Hạn {formatDateTime(offer.expiresAt)} ({formatRelative(offer.expiresAt)})
        </span>
      ) : (
        offer.respondedAt && <span className="text-muted-foreground tabular-nums">{formatDateTime(offer.respondedAt)}</span>
      )}
    </span>
  );
}

/**
 * "Phỏng vấn" tab of the HR JD page (US-5.4 AC-12, FR-30, FR-31): the JD's places, then every
 * nomination HR invited, by S_final, with its interview and offer. HR schedules, moves an interview
 * (a request of the student shows its reason) and records the result. `readOnly` for a closed or
 * cancelled campaign. DESIGN.md §6 › table, §7.
 */
export function InterviewsPanel({ jdId, readOnly }: { jdId: number; readOnly: boolean }) {
  const query = useJdInterviews(jdId);
  const [open, setOpen] = useState<Open>(null);

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Không tải được lịch phỏng vấn</AlertTitle>
        <AlertDescription>{apiErrorMessage(query.error)}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Thử lại
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  const { slots, items } = query.data;
  const selected = open ? items.find((item) => item.nominationId === open.nominationId) : undefined;
  const nameOf = (item: Item) => item.student.fullName || item.student.studentCode;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Suất thực tập</CardTitle>
          <CardDescription>
            Số sinh viên Đạt không vượt chỉ tiêu còn lại; người đạt sau khi hết suất vào danh sách dự bị và được lên Đạt khi có
            người từ chối hoặc quá hạn trả lời.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Slots slots={slots} />
        </CardContent>
      </Card>
      {items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>Chưa có sinh viên được mời phỏng vấn</EmptyTitle>
            <EmptyDescription>Mời phỏng vấn ở tab "Đề cử", rồi tạo lịch ở đây.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sinh viên</TableHead>
              <TableHead className="text-right">S_final</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Lịch phỏng vấn</TableHead>
              <TableHead>Lời mời</TableHead>
              <TableHead>
                <span className="sr-only">Thao tác</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const canSchedule = !readOnly && item.nominationStatus === 'INTERVIEW';
              const canRecord = canSchedule && item.interview !== null && item.interview.status !== 'DONE';
              return (
                <TableRow key={item.nominationId}>
                  <TableCell className="max-w-56">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{nameOf(item)}</span>
                      <span className="text-muted-foreground">{item.student.studentCode}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(item.sFinal, 2)}</TableCell>
                  <TableCell>
                    <IconBadge style={NOMINATION_STATUS_STYLE[item.nominationStatus]}>
                      {NOMINATION_STATUS_LABELS[item.nominationStatus]}
                    </IconBadge>
                  </TableCell>
                  <TableCell className="max-w-72 whitespace-normal">
                    <InterviewCell item={item} />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <OfferCell item={item} />
                  </TableCell>
                  <TableCell>
                    {canSchedule && (
                      <span className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setOpen({ kind: 'slot', nominationId: item.nominationId })}>
                          {item.interview ? <PencilLine data-icon="inline-start" /> : <CalendarPlus data-icon="inline-start" />}
                          {item.interview ? 'Đổi lịch' : 'Tạo lịch'}
                        </Button>
                        {canRecord && (
                          <Button size="sm" onClick={() => setOpen({ kind: 'result', nominationId: item.nominationId })}>
                            <ClipboardCheck data-icon="inline-start" />
                            Nhập kết quả
                          </Button>
                        )}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {open?.kind === 'slot' && selected && (
        <InterviewSlotSheet
          jdId={jdId}
          nominationId={selected.nominationId}
          studentName={nameOf(selected)}
          interview={selected.interview ?? undefined}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === 'result' && selected?.interview && (
        <InterviewResultDialog
          jdId={jdId}
          studentName={nameOf(selected)}
          interview={selected.interview}
          slots={slots}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
