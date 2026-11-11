import {
  type Campaign,
  EXAM_GRADING_REASONS,
  type ExamGradingReason,
  type GradingQueue,
  type ManualGradeResult,
} from '@srm/shared';
import { ChevronLeft, ChevronRight, CircleAlert, ClipboardCheck, PenLine } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCampaigns } from '@/features/center/campaigns/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { GRADING_QUEUE_PAGE_SIZE, type GradingQueuePage, useGradingQueue } from './api';
import { GRADING_REASON_LABELS, publicationMessage } from './labels';
import { ManualGradeSheet } from './manual-grade-sheet';

const ALL_REASONS = 'ALL';

/** History state of the entry that opened an answer, so closing the sheet goes back to the queue's. */
interface SheetState {
  gradingSheet?: true;
}

const isReason = (value: string | null): value is ExamGradingReason =>
  value !== null && (EXAM_GRADING_REASONS as readonly string[]).includes(value);

const positiveInt = (value: string | null): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

/** The campaign shown when the URL names none: the one in its test phase, else the latest running. */
function defaultCampaignId(campaigns: readonly Campaign[]): number | null {
  return (campaigns.find((campaign) => campaign.status === 'TESTING') ?? campaigns[0])?.id ?? null;
}

function QueueSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

/** One group of rows per session, "Bài #id"; one row per answer waiting (BR-03: no student). */
function QueueTable({ queue, onGrade }: { queue: GradingQueue; onGrade: (answerId: number) => void }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Câu</TableHead>
          <TableHead>Kỹ năng</TableHead>
          <TableHead className="text-right">Điểm tối đa</TableHead>
          <TableHead>Lý do chuyển</TableHead>
          <TableHead>
            <span className="sr-only">Thao tác</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      {queue.items.map((session) => (
        <TableBody key={session.sessionId}>
          <TableRow>
            <TableHead colSpan={5} scope="rowgroup" className="h-auto py-2 whitespace-normal">
              <span className="flex flex-wrap gap-x-2">
                <span className="tabular-nums">Bài #{session.sessionId}</span>
                <span className="font-normal text-muted-foreground break-words">
                  {session.jdTitle}
                  {session.companyName && ` · ${session.companyName}`} · nộp lúc {formatDateTime(session.submittedAt)}
                </span>
              </span>
            </TableHead>
          </TableRow>
          {session.answers.map((answer) => (
            <TableRow key={answer.answerId}>
              <TableCell className="tabular-nums">Câu {answer.questionNo}</TableCell>
              <TableCell className="max-w-48 truncate" title={answer.skill}>
                {answer.skill}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(answer.maxPoints)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {answer.reasons.map((reason) => (
                    <Badge key={reason} variant="outline">
                      {GRADING_REASON_LABELS[reason]}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    onClick={() => onGrade(answer.answerId)}
                    aria-label={`Chấm câu ${answer.questionNo} của bài #${session.sessionId}`}
                  >
                    <PenLine data-icon="inline-start" />
                    Chấm
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      ))}
    </Table>
  );
}

function Pagination({ queue, page, onPage }: { queue: GradingQueuePage; page: number; onPage: (page: number) => void }) {
  // From the page shown, which lags the URL while the next one loads.
  const from = queue.offset + 1;
  const to = from + queue.items.length - 1;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground tabular-nums">
        Bài {formatNumber(from)}–{formatNumber(to)} / {formatNumber(queue.totalSessions)} ·{' '}
        {formatNumber(queue.totalAnswers)} câu chờ chấm
      </p>
      <div className="flex gap-2">
        <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft data-icon="inline-start" />
          Trang trước
        </Button>
        <Button variant="outline" disabled={to >= queue.totalSessions} onClick={() => onPage(page + 1)}>
          Trang sau
          <ChevronRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}

/**
 * "Chấm tay" of the center portal (US-4.5 AC-1, AC-6, FR-23, CONTEXT D54): the essays the Grader
 * handed over, by campaign and reason, grouped by session and paged on the server. A lecturer
 * grades with a CENTER account. The filters, the page and the answer open are in the URL; opening
 * an answer adds a history entry, so Back closes the sheet.
 */
export function GradingQueuePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const campaigns = useCampaigns();
  const running = (campaigns.data ?? []).filter((campaign) => campaign.status !== 'DRAFT');
  const campaignId = positiveInt(searchParams.get('campaign')) ?? defaultCampaignId(running);
  const reasonParam = searchParams.get('reason');
  const reason = isReason(reasonParam) ? reasonParam : undefined;
  const page = positiveInt(searchParams.get('page')) ?? 1;
  const answerId = positiveInt(searchParams.get('answer'));
  const queue = useGradingQueue(campaignId, { reason, offset: (page - 1) * GRADING_QUEUE_PAGE_SIZE });

  const update = (changes: Record<string, string | null>, options: { replace?: boolean; state?: SheetState } = {}) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: options.replace ?? true, state: options.state },
    );

  const openAnswer = (id: number) => update({ answer: String(id) }, { replace: false, state: { gradingSheet: true } });
  // Back to the entry before the sheet when this page opened it; a link with `?answer=` has none.
  const closeAnswer = () => {
    if ((location.state as SheetState | null)?.gradingSheet) void navigate(-1);
    else update({ answer: null });
  };

  function onSaved(result: ManualGradeResult) {
    closeAnswer();
    const message = publicationMessage(result.session.publication, result.session.remainingAnswers);
    if (result.session.publication === 'NEXT_SWEEP') toast.warning(message);
    else toast.success(message);
  }

  let content;
  if (campaigns.isPending || (campaignId !== null && queue.isPending)) {
    content = <QueueSkeleton />;
  } else if (campaigns.isError) {
    content = (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Không tải được danh sách đợt</AlertTitle>
        <AlertDescription>{apiErrorMessage(campaigns.error)}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void campaigns.refetch()}>
            Thử lại
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (campaignId === null) {
    content = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ClipboardCheck />
          </EmptyMedia>
          <EmptyTitle>Chưa có đợt nào đang chạy</EmptyTitle>
          <EmptyDescription>Câu tự luận cần chấm tay hiện ở đây khi một đợt thực tập có bài test đã nộp.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else if (queue.isError) {
    content = (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Không tải được hàng đợi chấm tay</AlertTitle>
        <AlertDescription>{apiErrorMessage(queue.error)}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void queue.refetch()}>
            Thử lại
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (queue.data!.items.length === 0) {
    const beyondLastPage = queue.data!.totalSessions > 0;
    content = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ClipboardCheck />
          </EmptyMedia>
          <EmptyTitle>{beyondLastPage ? 'Trang này không còn bài nào' : 'Không còn câu cần chấm'}</EmptyTitle>
          <EmptyDescription>
            {beyondLastPage
              ? 'Các bài trên trang này đã được chấm xong.'
              : reason
                ? 'Không có câu nào chờ chấm với lý do này. Chọn lý do khác hoặc xem tất cả.'
                : 'Câu tự luận hiện ở đây khi AI chấm hai lượt lệch nhau, không chắc chắn, có cờ, không chấm được, hoặc khi bài sát ngưỡng.'}
          </EmptyDescription>
        </EmptyHeader>
        {beyondLastPage && (
          <EmptyContent>
            <Button variant="outline" onClick={() => update({ page: null })}>
              Về trang đầu
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  } else {
    content = (
      <>
        <QueueTable queue={queue.data!} onGrade={openAnswer} />
        <Pagination queue={queue.data!} page={page} onPage={(next) => update({ page: next === 1 ? null : String(next) })} />
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-xl font-semibold md:text-2xl">Chấm tay</h1>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Select
            // '' shows the placeholder and keeps the select controlled while the campaigns load.
            value={campaignId === null ? '' : String(campaignId)}
            onValueChange={(value) => update({ campaign: value, page: null })}
            disabled={campaigns.isPending || running.length === 0}
          >
            <SelectTrigger aria-label="Đợt thực tập" className="w-full sm:w-64">
              <SelectValue placeholder="Chọn đợt" />
            </SelectTrigger>
            <SelectContent>
              {running.map((campaign) => (
                <SelectItem key={campaign.id} value={String(campaign.id)}>
                  {campaign.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={reason ?? ALL_REASONS}
            onValueChange={(value) => update({ reason: value === ALL_REASONS ? null : value, page: null })}
          >
            <SelectTrigger aria-label="Lý do chuyển chấm tay" className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_REASONS}>Mọi lý do</SelectItem>
              {EXAM_GRADING_REASONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {GRADING_REASON_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Câu tự luận AI chấm chưa chắc chắn. Chấm từng tiêu chí của rubric; bài không hiện thông tin của sinh viên.
      </p>
      {content}
      <ManualGradeSheet answerId={answerId} onClose={closeAnswer} onSaved={onSaved} />
    </>
  );
}
