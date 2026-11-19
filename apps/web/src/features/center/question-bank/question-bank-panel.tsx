import { EXAM_PARTS, type ExamBlueprintView } from '@srm/shared';
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
import { formatDateTime, formatNumber } from '@/lib/format';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { useExamBlueprint, useGenerateQuestions, useLockQuestionBank } from './api';
import { BlueprintForm } from './blueprint-form';
import { BlueprintTable, CvVerificationSummary } from './blueprint-table';
import { uncheckedOf } from './coverage';
import { cellLabel, LOCK_BLOCKER_MESSAGES, QUESTION_TYPE_LABELS } from './labels';
import { RunStatus } from './run-status';
import { ValidationCard } from './validation-card';

/**
 * The "Ngân hàng câu hỏi" tab of an approved JD (FR-18, BR-05, US-4.1 AC-3, AC-11, US-4.2 AC-10,
 * AC-11, US-4.10 AC-5): the latest generation run, the coverage of each cell (usable questions,
 * checked or not, against 3× its count), "Sinh câu còn thiếu", "Kiểm câu bằng AI", "Khóa ngân
 * hàng", and the exam blueprint, editable while the bank is not locked and no run is RUNNING. The
 * view is polled while a run is RUNNING and the tab is `visible` (no SSE, CONTEXT D49).
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
      <ValidationCard view={view} editing={editing} />
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
                <p className="text-sm text-muted-foreground">
                  AI đang sinh hoặc kiểm câu: sửa được ma trận khi lượt chạy xong.
                </p>
              )}
              {EXAM_PARTS.map((part) => (
                <BlueprintTable key={part} part={part} blueprint={view.blueprint.parts[part]} coverage={view.coverage} />
              ))}
              <CvVerificationSummary settings={view.cvVerification} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

type CoverageCount = 'drafted' | 'validated' | 'rejected' | 'pending' | 'usable';

const totalOf = (view: ExamBlueprintView, key: CoverageCount) => sum(view.coverage.map((cell) => cell[key]));

function GenerationCard({ view, editing }: { view: ExamBlueprintView; editing: boolean }) {
  const generate = useGenerateQuestions(view.jdId);
  const short = view.coverage.filter((cell) => cell.usable < cell.min);
  const full = view.coverage.length - short.length;
  const percent = view.coverage.length === 0 ? 0 : Math.floor((full / view.coverage.length) * 100);
  const running = view.run?.status === 'RUNNING';
  const checking = view.validationRun?.status === 'RUNNING';

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
          AI sinh câu theo ma trận đề; code kiểm định dạng (đủ phương án, đúng một đáp án, rubric) và loại câu trùng. Mỗi ô
          cần ít nhất 3 lần số câu của một đề để mỗi sinh viên nhận một đề khác nhau. Kiểm nội dung bằng AI là tùy chọn.
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
              <EmptyDescription>Bấm "Sinh câu còn thiếu" để AI sinh câu theo ma trận đề.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
              <span className="font-medium">Độ phủ</span>
              <span className="text-muted-foreground tabular-nums">
                {formatNumber(full)}/{formatNumber(view.coverage.length)} ô đủ câu ({formatNumber(percent)}%)
              </span>
            </div>
            <Progress value={percent} aria-label="Tỷ lệ ô đủ câu" />
            <p className="text-sm text-muted-foreground tabular-nums">
              {formatNumber(totalOf(view, 'usable'))} câu dùng được ({formatNumber(totalOf(view, 'validated'))} đã kiểm
              đạt, {formatNumber(totalOf(view, 'pending'))} chưa kiểm) · {formatNumber(totalOf(view, 'rejected'))} bị loại
            </p>
            {short.length > 0 && (
              <div className="flex flex-col gap-1 text-sm">
                <h3 className="font-medium">Ô còn thiếu câu</h3>
                <ul className="flex flex-col gap-1 text-muted-foreground">
                  {short.map((cell) => (
                    <li key={`${cell.part}-${cell.skill}-${cell.difficulty}`} className="break-words">
                      {cellLabel(cell.skill, cell.difficulty)} ({QUESTION_TYPE_LABELS[cell.type].toLowerCase()}): có{' '}
                      {formatNumber(cell.usable)}, cần ít nhất {formatNumber(cell.min)}
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
              disabled={running || checking || editing || view.jdOutdated || short.length === 0 || generate.isPending}
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
            {!editing && !view.jdOutdated && checking && (
              <p className="text-sm text-muted-foreground">AI đang kiểm câu: sinh tiếp được khi lượt kiểm xong.</p>
            )}
            {!editing && !view.jdOutdated && !running && !checking && short.length === 0 && (
              <p className="text-sm text-muted-foreground">Mọi ô đã đủ câu.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * US-4.9 AC-4: questions retired after locking (a sample review, later appeals) may leave a cell below its 3×
 * floor, or below what one exam draws. No question is generated in their place; CENTER is told here. A cell
 * short of one exam's questions stops every exam not yet started (409 EXAM_BANK_INCOMPLETE).
 */
function ShortAfterLockAlert({ view }: { view: ExamBlueprintView }) {
  const short = view.coverage.filter((cell) => cell.usable < cell.min);
  if (short.length === 0) return null;
  const undrawable = short.filter((cell) => cell.usable < cell.needed);
  return (
    <Alert variant={undrawable.length > 0 ? 'destructive' : 'default'}>
      <TriangleAlert />
      <AlertTitle>
        {undrawable.length > 0 ? 'Phòng thi không rút được đề' : 'Có ô thiếu câu sau khi loại câu'}
      </AlertTitle>
      <AlertDescription>
        <p>
          {undrawable.length > 0
            ? 'Có ô không còn đủ câu cho một đề, nên sinh viên chưa làm bài sẽ không bắt đầu được bài test.'
            : 'Câu bị loại sau khi khóa (báo lỗi khi duyệt đề mẫu, phúc khảo) làm các ô dưới đây còn ít hơn 3 lần số câu của một đề. Sinh viên có thể nhận đề trùng nhau nhiều hơn.'}{' '}
          Ngân hàng đã khóa nên không sinh câu thay thế.
        </p>
        <ul className="flex flex-col gap-1">
          {short.map((cell) => (
            <li key={`${cell.part}-${cell.skill}-${cell.difficulty}`} className="break-words tabular-nums">
              {cellLabel(cell.skill, cell.difficulty)} ({QUESTION_TYPE_LABELS[cell.type].toLowerCase()}): còn{' '}
              {formatNumber(cell.usable)} câu, một đề rút {formatNumber(cell.needed)}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/**
 * "Khóa ngân hàng" (US-4.2 AC-6, AC-10, US-4.10 AC-4): off, with the reasons, until every cell holds
 * 3× usable questions; the dialog says how many nobody has checked, since exams draw them too.
 * Once locked, when and the bank's version. The dialog sends the `rowVersion` of the view it was
 * opened on (LESSONS §25). A 409 closes it with a toast; the view read again then shows the bank
 * as it is.
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
          <CardDescription>
            Phòng thi rút đề từ các câu dùng được của ngân hàng này, cả câu đã kiểm đạt lẫn câu chưa kiểm.
          </CardDescription>
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
          <ShortAfterLockAlert view={view} />
        </CardContent>
      </Card>
    );
  }

  const blockers = view.lock.blockers.filter((blocker) => blocker !== 'LOCKED');
  const unchecked = uncheckedOf(view);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Khóa ngân hàng</CardTitle>
        <CardDescription>
          Khóa khi mọi ô của ma trận đề đủ câu; không cần chờ AI kiểm. Sau khi khóa, phòng thi rút đề từ ngân hàng này;
          ma trận đề và câu hỏi không sửa, sinh thêm hay kiểm thêm được.
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
                Mọi ô của ma trận đề đã đủ câu ({formatNumber(totalOf(view, 'usable'))} câu dùng được).
                {unchecked > 0 &&
                  ` ${formatNumber(unchecked)} câu chưa được AI hay người kiểm; phòng thi vẫn rút các câu này.`}{' '}
                Sau khi khóa, ma trận đề và câu hỏi không sửa, sinh thêm hay kiểm thêm được, và ngân hàng không mở khóa
                lại được.
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
