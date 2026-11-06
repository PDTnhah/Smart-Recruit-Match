import { EXAM_PARTS, type ExamBlueprintView, type QuestionGenerationRun } from '@srm/shared';
import { CircleAlert, FileQuestion, Lock, PencilLine, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { useExamBlueprint, useGenerateQuestions } from './api';
import { BlueprintForm } from './blueprint-form';
import { BlueprintTable } from './blueprint-table';
import { cellLabel, QUESTION_TYPE_LABELS, RUN_STATUS_BADGE, RUN_STATUS_LABELS, runErrorMessage } from './labels';

/**
 * The "Ngân hàng câu hỏi" tab of an approved JD (FR-18, BR-05, US-4.1 AC-3, AC-11): the latest
 * generation run, the coverage of each cell (drafts against 3×–5× its count), "Sinh câu còn
 * thiếu", and the exam blueprint, editable while the bank is not locked and no run is RUNNING.
 * The view is polled while a run is RUNNING and the tab is `visible` (no SSE, CONTEXT D49).
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
      <GenerationCard view={view} editing={editing} />
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

function GenerationCard({ view, editing }: { view: ExamBlueprintView; editing: boolean }) {
  const generate = useGenerateQuestions(view.jdId);
  const short = view.coverage.filter((cell) => cell.drafted < cell.min);
  const drafted = sum(view.coverage.map((cell) => cell.drafted));
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
          Câu hỏi nháp do AI sinh theo ma trận đề. Mỗi ô cần từ 3 đến 5 lần số câu của một đề để mỗi sinh viên nhận
          một đề khác nhau.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {view.locked && (
          <Alert>
            <Lock />
            <AlertTitle>Ngân hàng đã khóa</AlertTitle>
            <AlertDescription>Ma trận đề và câu hỏi của JD này không đổi được nữa.</AlertDescription>
          </Alert>
        )}
        <RunStatus run={view.run} />
        {view.run === null && drafted === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileQuestion />
              </EmptyMedia>
              <EmptyTitle>Chưa có câu hỏi nháp</EmptyTitle>
              <EmptyDescription>Bấm "Sinh câu còn thiếu" để AI sinh câu theo ma trận đề.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
              <span className="font-medium">Độ phủ</span>
              <span className="text-muted-foreground tabular-nums">
                {formatNumber(full)}/{formatNumber(view.coverage.length)} ô đủ câu nháp ({formatNumber(percent)}%) ·{' '}
                {formatNumber(drafted)} câu nháp
              </span>
            </div>
            <Progress value={percent} aria-label="Tỷ lệ ô đủ câu nháp" />
            {short.length > 0 && (
              <div className="flex flex-col gap-1 text-sm">
                <h3 className="font-medium">Ô còn thiếu câu nháp</h3>
                <ul className="flex flex-col gap-1 text-muted-foreground">
                  {short.map((cell) => (
                    <li key={`${cell.part}-${cell.skill}-${cell.difficulty}`} className="break-words">
                      {cellLabel(cell.skill, cell.difficulty)} ({QUESTION_TYPE_LABELS[cell.type].toLowerCase()}): có{' '}
                      {formatNumber(cell.drafted)}, cần ít nhất {formatNumber(cell.min)}
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
              disabled={running || editing || short.length === 0 || generate.isPending}
            >
              {generate.isPending ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
              Sinh câu còn thiếu
            </Button>
            {editing && (
              <p className="text-sm text-muted-foreground">Lưu hoặc hủy thay đổi ma trận trước khi sinh câu.</p>
            )}
            {!editing && !running && short.length === 0 && (
              <p className="text-sm text-muted-foreground">Mọi ô đã đủ câu nháp.</p>
            )}
          </div>
        )}
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
          AI bắt đầu sinh câu {formatRelative(run.createdAt)}, thường xong trong vài phút. Trang tự cập nhật khi xong.
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
        câu nháp.
        {run.status === 'PARTIAL' && ` AI dừng khi còn ${formatNumber(left)} ô chưa đủ câu.`}
      </p>
    </div>
  );
}
