import type { MyExamItem, MyExamsResponse } from '@srm/shared';
import { CalendarClock, CircleAlert, ClipboardCheck, Info, ListOrdered, Play, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { PREFERENCES_PATH } from '@/features/student/preferences/paths';
import { ConfirmActionDialog } from '@/features/student/profile/confirm-action-dialog';
import { formatDateTime, formatMinutes } from '@/lib/format';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { useMyExams, useStartExam } from './api';
import { minutesLeftText, MY_EXAM_STATUS_BADGE, MY_EXAM_STATUS_LABELS } from './labels';
import { examRoomPath } from './paths';

function PageTitle() {
  return <h1 className="font-heading text-xl font-semibold md:text-2xl">Bài test</h1>;
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-6 w-2/3 max-w-sm" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

/** `testing_end` comes before the student would run out of T_test (CONTEXT D51). */
function cutShort(item: MyExamItem): boolean {
  return (
    item.canStart &&
    item.secondsIfStartedNow !== null &&
    item.durationMinutes !== null &&
    item.secondsIfStartedNow < item.durationMinutes * 60
  );
}

/** What the card says under the title, by where the test stands. */
function statusText(item: MyExamItem, testingOpen: boolean): string | null {
  switch (item.examStatus) {
    case 'NOT_STARTED':
      return testingOpen && item.durationMinutes === null ? 'Bài test của JD này chưa sẵn sàng. Thử lại sau.' : null;
    case 'IN_PROGRESS':
      return item.deadlineAt ? `Đang làm. Hạn nộp: ${formatDateTime(item.deadlineAt)}.` : 'Đang làm.';
    case 'SUBMITTED':
      return item.submittedAt ? `Đã nộp lúc ${formatDateTime(item.submittedAt)}.` : 'Đã nộp.';
    case 'EXPIRED':
      return item.submittedAt
        ? `Hết giờ lúc ${formatDateTime(item.submittedAt)}; bài được nộp với các câu trả lời đã lưu.`
        : 'Hết giờ; bài được nộp với các câu trả lời đã lưu.';
    case 'CLOSED':
      return 'Nguyện vọng đã bị hủy vì không làm bài test trước hạn.';
  }
}

function ExamCard({ item, testingOpen, onStart }: { item: MyExamItem; testingOpen: boolean; onStart: () => void }) {
  const text = statusText(item, testingOpen);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="break-words">{item.jdTitle}</h2>
        </CardTitle>
        <CardDescription className="break-words">{item.companyName}</CardDescription>
        <CardAction className="flex flex-wrap justify-end gap-2">
          <Badge variant={item.rank === 1 ? 'default' : 'outline'}>NV{item.rank}</Badge>
          <Badge variant={MY_EXAM_STATUS_BADGE[item.examStatus]}>{MY_EXAM_STATUS_LABELS[item.examStatus]}</Badge>
        </CardAction>
      </CardHeader>
      {(item.durationMinutes !== null || text || cutShort(item)) && (
        <CardContent className="flex flex-col gap-4">
          {item.durationMinutes !== null && item.questionCount !== null && (
            <p className="text-sm text-muted-foreground">
              Thời gian làm bài {formatMinutes(item.durationMinutes)} · {item.questionCount} câu · Chỉ làm một lần
            </p>
          )}
          {text && <p className="text-sm">{text}</p>}
          {cutShort(item) && item.secondsIfStartedNow !== null && item.durationMinutes !== null && (
            <Alert>
              <TriangleAlert />
              <AlertTitle>Còn ít thời gian hơn thời lượng bài</AlertTitle>
              <AlertDescription>
                Hạn làm test còn {minutesLeftText(item.secondsIfStartedNow)}, ít hơn{' '}
                {formatMinutes(item.durationMinutes)} của bài. Bắt đầu bây giờ thì bài đóng lúc hết hạn làm test.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      )}
      {item.canStart && (
        <CardFooter className="flex justify-end">
          <Button className="w-full sm:w-auto" onClick={onStart}>
            <Play data-icon="inline-start" />
            Bắt đầu làm bài
          </Button>
        </CardFooter>
      )}
      {item.examStatus === 'IN_PROGRESS' && item.sessionId !== null && (
        <CardFooter className="flex justify-end">
          <Button asChild className="w-full sm:w-auto">
            <Link to={examRoomPath(item.sessionId)}>
              <ClipboardCheck data-icon="inline-start" />
              Làm tiếp
            </Link>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

/** Before or after the TESTING phase; null while tests can be started. */
function PhaseAlert({ view }: { view: MyExamsResponse }) {
  const campaign = view.campaign;
  if (!campaign || campaign.testingOpen) return null;
  const ended = campaign.testingEnd !== null && Date.parse(campaign.testingEnd) <= Date.parse(view.serverNow);
  return (
    <Alert>
      <CalendarClock />
      <AlertTitle>{ended ? 'Đã hết hạn làm bài test' : 'Chưa đến giai đoạn làm bài test'}</AlertTitle>
      <AlertDescription>
        {ended
          ? 'Đợt đã qua hạn làm bài test. Nguyện vọng chưa làm bài test đã bị hủy.'
          : 'Bài test mở khi đợt chuyển sang giai đoạn làm test.'}
      </AlertDescription>
    </Alert>
  );
}

/** What the student agrees to when starting (AC-13): one go, a clock that does not stop. */
function startDescription(item: MyExamItem): string {
  const size =
    item.questionCount !== null && item.durationMinutes !== null
      ? `Bài có ${item.questionCount} câu, làm trong ${formatMinutes(item.durationMinutes)}. `
      : '';
  const short =
    cutShort(item) && item.secondsIfStartedNow !== null
      ? ` Hạn làm test chỉ còn ${minutesLeftText(item.secondsIfStartedNow)} nên bài sẽ đóng sớm hơn.`
      : '';
  return `${size}Đồng hồ chạy ngay khi bắt đầu và không dừng khi rời trang hay mất mạng. Mỗi bài chỉ làm một lần.${short}`;
}

/**
 * "Bài test" of the student portal (US-4.3 AC-13, AC-14): one card per preference of the latest
 * campaign with T_test, the number of questions and where the test stands; a confirmation before
 * a test starts. Four states of DESIGN.md §7.
 */
export function ExamsPage() {
  const query = useMyExams({ refetchWhileOpen: true });
  const start = useStartExam();
  const navigate = useNavigate();
  // The preference being confirmed; its card's figures come from the latest read of the list.
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  async function onConfirmStart() {
    if (confirmingId === null) return;
    setStartError(null);
    try {
      const paper = await start.mutateAsync(confirmingId);
      void navigate(examRoomPath(paper.data.sessionId));
    } catch (failure) {
      setStartError(apiErrorMessage(failure));
      // The phase, the preference or the bank changed meanwhile: show where things stand now.
      if (failure instanceof ApiRequestError && failure.status === 409) void query.refetch();
    }
  }

  if (query.isPending) {
    return (
      <>
        <PageTitle />
        <PageSkeleton />
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        <PageTitle />
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Không tải được danh sách bài test</AlertTitle>
          <AlertDescription>{apiErrorMessage(query.error)}</AlertDescription>
          <AlertAction>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Thử lại
            </Button>
          </AlertAction>
        </Alert>
      </>
    );
  }

  const view = query.data;
  const campaign = view.campaign;
  if (!campaign || view.items.length === 0) {
    return (
      <>
        <PageTitle />
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardCheck />
            </EmptyMedia>
            <EmptyTitle>Chưa có bài test</EmptyTitle>
            <EmptyDescription>
              Mỗi nguyện vọng đã lưu có một bài test. Bài test hiện ở đây và mở khi đợt chuyển sang giai đoạn làm test.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link to={PREFERENCES_PATH}>
                <ListOrdered data-icon="inline-start" />
                Mở nguyện vọng
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      </>
    );
  }

  const startable = view.items.some((item) => item.canStart);
  const confirming = view.items.find((item) => item.preferenceId === confirmingId) ?? null;
  return (
    <>
      <PageTitle />
      <div className="flex min-w-0 flex-col gap-2">
        <span className="font-medium break-words">{campaign.name}</span>
        {campaign.testingEnd && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
            Hạn làm bài test: {formatDateTime(campaign.testingEnd)}
          </p>
        )}
      </div>
      <PhaseAlert view={view} />
      {startable && (
        <Alert>
          <Info />
          <AlertTitle>Mỗi bài test chỉ làm một lần</AlertTitle>
          <AlertDescription>
            Đồng hồ chạy từ lúc bắt đầu và không dừng khi rời trang hay mất mạng. Câu trả lời được lưu tự động; hết giờ
            thì bài tự nộp với các câu đã lưu.
          </AlertDescription>
        </Alert>
      )}
      {view.items.map((item) => (
        <ExamCard
          key={item.preferenceId}
          item={item}
          testingOpen={campaign.testingOpen}
          onStart={() => {
            setStartError(null);
            setConfirmingId(item.preferenceId);
          }}
        />
      ))}
      <ConfirmActionDialog
        open={confirming !== null}
        onClose={() => setConfirmingId(null)}
        title={confirming ? `Bắt đầu bài test "${confirming.jdTitle}"?` : 'Bắt đầu bài test?'}
        description={confirming ? startDescription(confirming) : ''}
        actionLabel="Bắt đầu làm bài"
        onConfirm={() => void onConfirmStart()}
        pending={start.isPending}
        error={startError}
        errorTitle="Chưa bắt đầu được bài test"
      />
    </>
  );
}
