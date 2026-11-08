import type { ExamPaper, ExamSubmission } from '@srm/shared';
import { ChevronLeft, ChevronRight, CircleAlert, Send, TimerOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useBeforeUnload, useBlocker, useParams, useSearchParams } from 'react-router';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmActionDialog } from '@/features/student/profile/confirm-action-dialog';
import { formatDateTime } from '@/lib/format';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { type TimedPaper, useExamSession, useMyExams, useSubmitExam } from './api';
import { Countdown } from './countdown';
import { ExamLayout } from './exam-layout';
import { EXAMS_PATH } from './paths';
import { QuestionGrid } from './question-grid';
import { QuestionView } from './question-view';
import { SaveIndicator } from './save-indicator';
import { isAnswered, useExamAutosave } from './use-exam-autosave';

function BackToExams() {
  return (
    <Button asChild className="w-full sm:w-auto">
      <Link to={EXAMS_PATH}>Về danh sách bài test</Link>
    </Button>
  );
}

function RoomSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-7 w-2/3 max-w-sm" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

interface ClosedExamProps {
  status: ExamSubmission['status'];
  submittedAt: string;
  counts?: { answered: number; total: number };
}

/** The paper is in: submitted by the student, or closed when time ran out. */
function ClosedExam({ status, submittedAt, counts }: ClosedExamProps) {
  const answered = counts ? ` Đã trả lời ${counts.answered}/${counts.total} câu.` : '';
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="font-heading text-xl font-semibold md:text-2xl">
            {status === 'EXPIRED' ? 'Hết giờ, bài đã được nộp' : 'Đã nộp bài'}
          </h1>
        </CardTitle>
        <CardDescription>
          {status === 'EXPIRED'
            ? `Bài được nộp lúc hết giờ (${formatDateTime(submittedAt)}) với các câu trả lời đã lưu.`
            : `Nộp lúc ${formatDateTime(submittedAt)}.`}
          {answered} Kết quả có sau khi bài được chấm.
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex justify-end">
        <BackToExams />
      </CardFooter>
    </Card>
  );
}

/**
 * The exam room `/sv/exam/:sessionId` (US-4.3 AC-7, AC-13): a route of its own with a minimal
 * layout. The paper is read once per visit; the room keeps the answers from there.
 */
export function ExamRoomPage() {
  const params = useParams();
  const sessionId = Number(params.sessionId);
  const valid = Number.isSafeInteger(sessionId) && sessionId > 0;
  const query = useExamSession(sessionId, valid);

  if (!valid || query.isError) {
    const notFound = !valid || (query.error instanceof ApiRequestError && query.error.status === 404);
    return (
      <ExamLayout>
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Không mở được bài test</AlertTitle>
          <AlertDescription>
            {notFound ? 'Không tìm thấy bài test này, hoặc tài khoản không có quyền xem.' : apiErrorMessage(query.error)}
          </AlertDescription>
          {!notFound && (
            <AlertAction>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Thử lại
              </Button>
            </AlertAction>
          )}
        </Alert>
        <BackToExams />
      </ExamLayout>
    );
  }
  if (query.isPending) {
    return (
      <ExamLayout>
        <RoomSkeleton />
      </ExamLayout>
    );
  }
  const { data: paper } = query.data;
  if (paper.status !== 'IN_PROGRESS') {
    return (
      <ExamLayout>
        <ClosedExam status={paper.status} submittedAt={paper.submittedAt ?? paper.deadlineAt} />
      </ExamLayout>
    );
  }
  return <ExamRoom key={paper.sessionId} view={query.data} />;
}

/** Why the paper is being closed: the student's "Nộp bài", the clock, or the server refusing saves. */
type FinishReason = 'STUDENT' | 'TIME_UP' | 'CLOSED';

type Stage = 'TAKING' | 'FINISHING' | 'DONE';

function questionIndexOf(value: string | null, total: number): number {
  const no = Number(value ?? '1');
  return Number.isSafeInteger(no) && no >= 1 && no <= total ? no - 1 : 0;
}

function ExamRoom({ view }: { view: TimedPaper }) {
  const paper: ExamPaper = view.data;
  const total = paper.questions.length;
  const [offsetMs, setOffsetMs] = useState(view.offsetMs);
  const [deadlineAt, setDeadlineAt] = useState(paper.deadlineAt);
  const [stage, setStage] = useState<Stage>('TAKING');
  const [timeUp, setTimeUp] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<ExamSubmission | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const submit = useSubmitExam(paper.sessionId);
  const exam = useMyExams().data?.items.find((item) => item.sessionId === paper.sessionId);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const finishing = useRef(false);
  const timeUpRef = useRef(false);

  const autosave = useExamAutosave({
    sessionId: paper.sessionId,
    saved: paper.answers,
    onSaved: (result) => {
      setOffsetMs(result.offsetMs);
      setDeadlineAt(result.data.deadlineAt);
    },
    onClosed: () => void finish('CLOSED'),
  });

  /**
   * Sends what is still waiting, then submits (AC-8, AC-13). Unsaved answers are never given up
   * while they can still be saved: with no network the submit waits for it to come back.
   */
  async function finish(reason: FinishReason) {
    if (finishing.current) return;
    finishing.current = true;
    setStage('FINISHING');
    setFinishError(null);
    const outcome = await autosave.flush();
    if (outcome === 'FAILED') {
      finishing.current = false;
      setFinishError(
        navigator.onLine
          ? 'Chưa lưu được các câu trả lời mới nhất nên chưa nộp được bài. Thử lại sau giây lát.'
          : 'Mất kết nối nên chưa nộp được bài. Bài sẽ được nộp ngay khi có mạng lại.',
      );
      if (reason === 'STUDENT' && !timeUpRef.current) setStage('TAKING');
      return;
    }
    try {
      const result = await submit.mutateAsync();
      autosave.stop();
      setSubmission(result);
      setStage('DONE');
      setConfirmOpen(false);
    } catch (error) {
      finishing.current = false;
      setFinishError(apiErrorMessage(error));
      if (reason === 'STUDENT' && !timeUpRef.current) setStage('TAKING');
    }
  }

  const latestFinish = useRef(finish);
  useEffect(() => {
    latestFinish.current = finish;
  });

  const onTimeUp = useCallback(() => {
    timeUpRef.current = true;
    setTimeUp(true);
    // The page shows how the submit goes, with "Thử lại" if it fails; the dialog would hide it.
    setConfirmOpen(false);
    void latestFinish.current('TIME_UP');
  }, []);

  // Time is up but the paper could not go: it goes as soon as the network is back.
  const waiting = timeUp && finishError !== null;
  useEffect(() => {
    if (!waiting) return;
    const retry = () => void latestFinish.current('TIME_UP');
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [waiting]);

  // The clock runs on while the student is away: leaving asks first; answers waiting stay stored.
  const taking = stage === 'TAKING';
  const { hasPending } = autosave;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => taking && currentLocation.pathname !== nextLocation.pathname,
  );
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (taking && hasPending()) event.preventDefault();
      },
      [taking, hasPending],
    ),
  );

  const locked = stage !== 'TAKING' || timeUp;
  const index = questionIndexOf(searchParams.get('q'), total);
  const question = paper.questions[index];
  const answered = paper.questions.filter((item) => isAnswered(autosave.answers.get(item.questionId))).length;

  function goTo(next: number) {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        params.set('q', String(next + 1));
        return params;
      },
      { replace: true },
    );
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  if (stage === 'DONE' && submission) {
    return (
      <ExamLayout>
        <ClosedExam
          status={submission.status}
          submittedAt={submission.submittedAt}
          counts={{ answered: submission.answeredCount, total: submission.questionCount }}
        />
      </ExamLayout>
    );
  }

  const unanswered = total - answered;
  const header = (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
        <Countdown deadlineAt={deadlineAt} offsetMs={offsetMs} onExpire={onTimeUp} />
        <SaveIndicator status={autosave.status} />
      </div>
      <Button onClick={() => setConfirmOpen(true)} disabled={locked}>
        <Send data-icon="inline-start" />
        Nộp bài
      </Button>
    </>
  );

  return (
    <ExamLayout header={header}>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="font-heading text-xl font-semibold break-words md:text-2xl">{exam?.jdTitle ?? 'Bài test'}</h1>
        <p className="text-sm break-words text-muted-foreground">
          {exam?.companyName ? `${exam.companyName} · ` : ''}Hạn nộp: {formatDateTime(deadlineAt)}
        </p>
      </div>

      {timeUp && (
        <Alert>
          <TimerOff />
          <AlertTitle>Hết giờ</AlertTitle>
          <AlertDescription>
            {waiting ? 'Câu trả lời không sửa được nữa.' : 'Câu trả lời không sửa được nữa. Đang nộp bài…'}
          </AlertDescription>
        </Alert>
      )}
      {finishError && !confirmOpen && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Chưa nộp được bài</AlertTitle>
          <AlertDescription>{finishError}</AlertDescription>
          <AlertAction>
            <Button variant="outline" onClick={() => void finish(timeUp ? 'TIME_UP' : 'STUDENT')}>
              Thử lại
            </Button>
          </AlertAction>
        </Alert>
      )}

      {question && (
        <QuestionView
          key={question.questionId}
          question={question}
          total={total}
          answer={autosave.answers.get(question.questionId)}
          locked={locked}
          onAnswer={(answer) => autosave.setAnswer(question.questionId, answer)}
          headingRef={headingRef}
        />
      )}

      <nav aria-label="Chuyển câu" className="flex gap-2">
        <Button variant="outline" className="flex-1 sm:flex-none" disabled={index === 0} onClick={() => goTo(index - 1)}>
          <ChevronLeft data-icon="inline-start" />
          Câu trước
        </Button>
        <Button
          variant="outline"
          className="flex-1 sm:ml-auto sm:flex-none"
          disabled={index >= total - 1}
          onClick={() => goTo(index + 1)}
        >
          Câu sau
          <ChevronRight data-icon="inline-end" />
        </Button>
      </nav>

      <QuestionGrid
        questions={paper.questions}
        answers={autosave.answers}
        current={index}
        onSelect={goTo}
        footer={
          <Button className="w-full sm:w-auto" onClick={() => setConfirmOpen(true)} disabled={locked}>
            {stage === 'FINISHING' ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}
            Nộp bài
          </Button>
        }
      />

      <ConfirmActionDialog
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setFinishError(null);
        }}
        title="Nộp bài?"
        description={`Đã trả lời ${answered}/${total} câu${unanswered > 0 ? `, còn ${unanswered} câu chưa trả lời` : ''}. Sau khi nộp, bài không sửa được nữa.`}
        actionLabel="Nộp bài"
        onConfirm={() => void finish('STUDENT')}
        pending={stage === 'FINISHING'}
        error={finishError}
        errorTitle="Chưa nộp được bài"
      />
      <ConfirmActionDialog
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="Rời phòng thi?"
        description='Đồng hồ vẫn chạy khi rời trang. Các câu trả lời đã lưu được giữ lại; mở lại bài từ màn "Bài test" để làm tiếp.'
        actionLabel="Rời phòng thi"
        onConfirm={() => blocker.proceed?.()}
        pending={false}
        error={null}
        errorTitle=""
      />
    </ExamLayout>
  );
}
