import { EXAM_PARTS, type ExamBlueprintView, type QuestionGenerationRun } from '@srm/shared';
import { CircleAlert, FileQuestion, Lock, PencilLine, Sparkles, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { useExamBlueprint, useGenerateQuestions, useLockQuestionBank } from './api';
import { BlueprintForm } from './blueprint-form';
import { BlueprintTable } from './blueprint-table';
import {
  cellLabel,
  LOCK_BLOCKER_MESSAGES,
  QUESTION_TYPE_LABELS,
  RUN_STATUS_BADGE,
  RUN_STATUS_LABELS,
  runErrorMessage,
} from './labels';

/**
 * The "Ngân hàng câu hỏi" tab of an approved JD (FR-18, BR-05, US-4.1 AC-3, AC-11, US-4.2 AC-10,
 * AC-11): the latest generation run, the coverage of each cell (VALIDATED questions against 3× its
 * count), "Sinh câu còn thiếu", "Khóa ngân hàng", and the exam blueprint, editable while the bank
 * is not locked and no run is RUNNING. The view is polled while a run is RUNNING and the tab is
 * `visible` (no SSE, CONTEXT D49).
 */
export function QuestionBankPanel({ jdId, visible }: { jdId: number; visible: boolean }) {
  const blueprint = useExamBlueprint(jdId, { poll: visible });
  const [editing, setEditing] = useState(false);
  // A new value mounts a fresh form, with the view read after a row_version conflict.
  const [formRevision, setFormRevision] = useState(0);

  if (blueprint.isPending) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (blueprint.isError) {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Không tải được ngân hàng câu hỏi</AlertTitle>
        <AlertDescription>{apiErrorMessage(blueprint.error)}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void blueprint.refetch()}>
            Thử lại
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  const view = blueprint.data;
  return (
    <div className="flex flex-col gap-6">
      {view.jdOutdated && (
        <Alert>
          <TriangleAlert />
          <AlertTitle>Yêu cầu của JD đã có phiên bản mới</AlertTitle>
          <AlertDescription>
            Lưu lại ma trận đề theo yêu cầu mới để sinh tiếp và khóa ngân hàng. Sau khi lưu, câu của kỹ năng không còn
            trong yêu cầu không được tính.
          </AlertDescription>
          {view.editable && !editing && (
            <AlertAction>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Sửa ma trận
              </Button>
            </AlertAction>
          )}
        </Alert>
      )}
      <GenerationCard view={view} editing={editing} />
      <LockCard view={view} editing={editing} />
      <Card>
        <CardHeader>
          <CardTitle>Ma trận đề</CardTitle>
          <CardDescription>
            Làm bài trong {formatNumber(view.blueprint.duration_minutes)} phút. Kỹ năng lấy theo yêu cầu chuẩn hóa của JD.
          </CardDescription>
          {view.editable && !editing && (
            <CardAction>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <PencilLine data-icon="inline-start" />
                Sửa ma trận
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {editing ? (
            <BlueprintForm
              key={formRevision}
              view={view}
              onDone={() => setEditing(false)}
              onReload={async () => {
                await blueprint.refetch();
                setFormRevision((revision) => revision + 1);
              }}
              onRefresh={() => void blueprint.refetch()}
            />
          ) : (
            <>
              {!view.editable && !view.locked && (
                <p className="text-sm text-muted-foreground">AI đang sinh câu: sửa được ma trận khi lượt sinh xong.</p>
              )}
              {EXAM_PARTS.map((part) => (
                <BlueprintTable key={part} part={part} blueprint={view.blueprint.parts[part]} coverage={view.coverage} />
              ))}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

type CoverageCount = 'drafted' | 'validated' | 'rejected' | 'pending';

const totalOf = (view: ExamBlueprintView, key: CoverageCount) => sum(view.coverage.map((cell) => cell[key]));

function GenerationCard({ view, editing }: { view: ExamBlueprintView; editing: boolean }) {
  const generate = useGenerateQuestions(view.jdId);
  const short = view.coverage.filter((cell) => cell.validated < cell.min);
  const full = view.coverage.length - short.length;
  const percent = view.coverage.length === 0 ? 0 : Math.floor((full / view.coverage.length) * 100);
  const running = view.run?.status === 'RUNNING';

  async function start() {
    try {
      await generate.mutateAsync();
      toast.success('Đã bắt đầu sinh câu hỏi. Trang tự cập nhật khi xong.');
    } catch {
      // Shown in the card from the mutation's error.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ngân hàng câu hỏi</CardTitle>
        <CardDescription>
          AI sinh câu theo ma trận đề rồi kiểm từng câu: tự giải khi không thấy đáp án, loại câu sai và sinh bù. Mỗi ô cần
          ít nhất 3 lần số câu của một đề đạt kiểm định để mỗi sinh viên nhận một đề khác nhau.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <RunStatus run={view.run} />
        {view.run === null && totalOf(view, 'drafted') === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileQuestion />
              </EmptyMedia>
              <EmptyTitle>Chưa có câu hỏi</EmptyTitle>
              <EmptyDescription>Bấm "Sinh câu còn thiếu" để AI sinh và kiểm câu theo ma trận đề.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
              <span className="font-medium">Độ phủ</span>
              <span className="text-muted-foreground tabular-nums">
                {formatNumber(full)}/{formatNumber(view.coverage.length)} ô đủ câu đạt ({formatNumber(percent)}%)
              </span>
            </div>
            <Progress value={percent} aria-label="Tỷ lệ ô đủ câu đạt kiểm định" />
            <p className="text-sm text-muted-foreground tabular-nums">
              {formatNumber(totalOf(view, 'validated'))} câu đạt · {formatNumber(totalOf(view, 'rejected'))} bị loại ·{' '}
              {formatNumber(totalOf(view, 'pending'))} chờ kiểm
            </p>
            {short.length > 0 && (
              <div className="flex flex-col gap-1 text-sm">
                <h3 className="font-medium">Ô còn thiếu câu đạt</h3>
                <ul className="flex flex-col gap-1 text-muted-foreground">
                  {short.map((cell) => (
                    <li key={`${cell.part}-${cell.skill}-${cell.difficulty}`} className="break-words">
                      {cellLabel(cell.skill, cell.difficulty)} ({QUESTION_TYPE_LABELS[cell.type].toLowerCase()}): đạt{' '}
                      {formatNumber(cell.validated)}, cần ít nhất {formatNumber(cell.min)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {generate.isError && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Chưa bắt đầu sinh câu được</AlertTitle>
            <AlertDescription>{apiErrorMessage(generate.error)}</AlertDescription>
          </Alert>
        )}
        {!view.locked && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              className="w-full sm:w-auto"
              onClick={() => void start()}
              disabled={running || editing || view.jdOutdated || short.length === 0 || generate.isPending}
            >
              {generate.isPending ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
              Sinh câu còn thiếu
            </Button>
            {editing && (
              <p className="text-sm text-muted-foreground">Lưu hoặc hủy thay đổi ma trận trước khi sinh câu.</p>
            )}
            {!editing && view.jdOutdated && (
              <p className="text-sm text-muted-foreground">Lưu lại ma trận đề theo yêu cầu mới trước khi sinh câu.</p>
            )}
            {!editing && !view.jdOutdated && !running && short.length === 0 && (
              <p className="text-sm text-muted-foreground">Mọi ô đã đủ câu đạt kiểm định.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * "Khóa ngân hàng" (US-4.2 AC-6, AC-10): off, with the reasons, until every cell holds 3× VALIDATED
 * questions; once locked, when and the bank's version. The dialog sends the `rowVersion` of the
 * view it was opened on (LESSONS §25). A 409 closes it with a toast; the view read again then
 * shows the bank as it is.
 */
function LockCard({ view, editing }: { view: ExamBlueprintView; editing: boolean }) {
  const lock = useLockQuestionBank(view.jdId);
  // The rowVersion the dialog was opened on; null while it is closed.
  const [confirming, setConfirming] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = lock.isPending;

  async function confirm(rowVersion: number) {
    setError(null);
    try {
      await lock.mutateAsync({ bankId: view.bankId, rowVersion });
      setConfirming(null);
      toast.success('Đã khóa ngân hàng câu hỏi.');
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 409) {
        setConfirming(null);
        toast.error(apiErrorMessage(caught));
        return;
      }
      setError(apiErrorMessage(caught));
    }
  }

  if (view.locked) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Khóa ngân hàng</CardTitle>
          <CardDescription>Phòng thi rút đề từ các câu đạt kiểm định của ngân hàng này.</CardDescription>
          <CardAction>
            <Badge>
              <Lock data-icon="inline-start" />
              Đã khóa
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Khóa lúc</dt>
            <dd>{view.lockedAt ? formatDateTime(view.lockedAt) : '–'}</dd>
            <dt className="text-muted-foreground">Phiên bản</dt>
            <dd className="tabular-nums">{formatNumber(view.version)}</dd>
          </dl>
          <p className="text-sm text-muted-foreground">
            Ma trận đề và câu hỏi không sửa được nữa. Mỗi câu bị loại khỏi ngân hàng sau khi khóa làm tăng phiên bản.
          </p>
        </CardContent>
      </Card>
    );
  }

  const blockers = view.lock.blockers.filter((blocker) => blocker !== 'LOCKED');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Khóa ngân hàng</CardTitle>
        <CardDescription>
          Khóa khi mọi ô của ma trận đề đủ câu đạt kiểm định. Sau khi khóa, phòng thi rút đề từ ngân hàng này; ma trận đề
          và câu hỏi không sửa hay sinh thêm được.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {(editing || blockers.length > 0) && (
          <div className="flex flex-col gap-1 text-sm">
            <h3 className="font-medium">Chưa khóa được</h3>
            <ul className="flex flex-col gap-1 text-muted-foreground">
              {editing && <li>Đang sửa ma trận đề: lưu hoặc hủy thay đổi trước.</li>}
              {blockers.map((blocker) => (
                <li key={blocker}>{LOCK_BLOCKER_MESSAGES[blocker]}</li>
              ))}
            </ul>
          </div>
        )}
        <AlertDialog
          open={confirming !== null}
          onOpenChange={(next) => {
            if (pending) return;
            setConfirming(next ? view.rowVersion : null);
            if (!next) setError(null);
          }}
        >
          <AlertDialogTrigger asChild>
            <Button className="w-full sm:w-auto sm:self-start" disabled={editing || !view.lock.allowed}>
              <Lock data-icon="inline-start" />
              Khóa ngân hàng
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Khóa ngân hàng câu hỏi?</AlertDialogTitle>
              <AlertDialogDescription>
                Mọi ô của ma trận đề đã đủ câu đạt kiểm định ({formatNumber(totalOf(view, 'validated'))} câu). Sau khi
                khóa, ma trận đề và câu hỏi không sửa hay sinh thêm được, và ngân hàng không mở khóa lại được.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>Chưa khóa được ngân hàng</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Hủy</AlertDialogCancel>
              <Button onClick={() => confirming !== null && void confirm(confirming)} disabled={pending}>
                {pending && <Spinner data-icon="inline-start" />}
                {pending ? 'Đang khóa' : 'Khóa ngân hàng'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

/** The latest run (AC-11): running, finished (with the cells it left short) or failed. */
function RunStatus({ run }: { run: QuestionGenerationRun | null }) {
  if (run === null) return null;
  if (run.status === 'RUNNING') {
    return (
      <Alert>
        <Spinner />
        <AlertTitle>{RUN_STATUS_LABELS.RUNNING}</AlertTitle>
        <AlertDescription>
          AI bắt đầu sinh và kiểm câu {formatRelative(run.createdAt)}, thường xong trong vài phút. Trang tự cập nhật
          khi xong.
        </AlertDescription>
      </Alert>
    );
  }
  if (run.status === 'FAILED') {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>{RUN_STATUS_LABELS.FAILED}</AlertTitle>
        <AlertDescription>
          {runErrorMessage(run.errorCode)} Các câu đã sinh được giữ lại. Bấm "Sinh câu còn thiếu" để sinh tiếp.
        </AlertDescription>
      </Alert>
    );
  }
  const left = run.missingCells?.length ?? 0;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Lượt sinh gần nhất</span>
        <Badge variant={RUN_STATUS_BADGE[run.status]}>{RUN_STATUS_LABELS[run.status]}</Badge>
      </div>
      <p className="text-muted-foreground">
        {run.finishedAt ? `Xong lúc ${formatDateTime(run.finishedAt)}, thêm` : 'Thêm'} {formatNumber(run.questionsReceived)}{' '}
        câu mới.
        {run.status === 'PARTIAL' && ` AI dừng khi còn ${formatNumber(left)} ô chưa đủ câu đạt.`}
      </p>
    </div>
  );
}
