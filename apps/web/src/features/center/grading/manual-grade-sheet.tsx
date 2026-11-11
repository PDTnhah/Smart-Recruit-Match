import type { ManualGradeResult, ManualGradingAiPass, ManualGradingDetail } from '@srm/shared';
import { CircleAlert } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatDateTime, formatNumber } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { useManualGradingDetail } from './api';
import { CONFIDENCE_LABELS, FLAG_LABELS, GRADING_REASON_DESCRIPTIONS, GRADING_REASON_LABELS } from './labels';
import { ManualGradeForm } from './manual-grade-form';

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-2">
      <h3 id={id} className="text-base font-medium">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Text written by others (stem, answer, sample answer): plain text, line breaks kept (Invariant 6). */
function PlainText({ text }: { text: string }) {
  return <p className="text-sm whitespace-pre-wrap break-words">{text}</p>;
}

/** One pass of the Grader: points, confidence, flags and the reason of each criterion (CONTEXT D54). */
function AiPass({ pass, detail }: { pass: ManualGradingAiPass; detail: ManualGradingDetail }) {
  if (pass.failureCode !== null) {
    return (
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-medium">Lượt {pass.passNo}: AI không chấm được</h4>
        <p className="text-sm break-words text-muted-foreground">Mã lỗi: {pass.failureCode}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-medium tabular-nums">
        Lượt {pass.passNo}: {formatNumber(pass.points ?? 0)} / {formatNumber(detail.maxPoints)} điểm
        {pass.confidence && ` · Độ tin cậy ${CONFIDENCE_LABELS[pass.confidence].toLowerCase()}`}
      </h4>
      {pass.flags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pass.flags.map((flag) => (
            <Badge key={flag} variant="outline">
              {FLAG_LABELS[flag]}
            </Badge>
          ))}
        </div>
      )}
      <ol className="flex flex-col gap-1 text-sm">
        {pass.criteria.map((criterion) => (
          <li key={criterion.index} className="break-words">
            <span className="font-medium tabular-nums">
              Tiêu chí {criterion.index + 1}: {formatNumber(criterion.points)} /{' '}
              {formatNumber(detail.rubric[criterion.index]?.maxPoints ?? 0)}
            </span>{' '}
            <span className="text-muted-foreground">— {criterion.reason}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** What the grader reads before grading (AC-2): no student identity, only the paper (BR-03). */
function AnswerSections({ detail }: { detail: ManualGradingDetail }) {
  return (
    <>
      <Section title="Lý do chuyển chấm tay">
        <ul className="flex flex-col gap-2 text-sm">
          {detail.reasons.map((reason) => (
            <li key={reason} className="flex flex-col items-start gap-1">
              <Badge variant="outline">{GRADING_REASON_LABELS[reason]}</Badge>
              <span className="text-muted-foreground">{GRADING_REASON_DESCRIPTIONS[reason]}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Đề bài">
        <PlainText text={detail.stem} />
      </Section>
      <Section title="Bài làm">
        {detail.answerText.trim() === '' ? (
          <p className="text-sm text-muted-foreground">Bài làm trống.</p>
        ) : (
          <PlainText text={detail.answerText} />
        )}
      </Section>
      <Section title="Đáp án mẫu">
        {detail.sampleAnswer ? (
          <PlainText text={detail.sampleAnswer} />
        ) : (
          <p className="text-sm text-muted-foreground">Câu này không có đáp án mẫu.</p>
        )}
      </Section>
      <Section title="Hai lượt chấm của AI">
        {detail.aiPasses.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có lượt chấm nào của AI.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {detail.aiPasses.map((pass) => (
              <AiPass key={pass.passNo} pass={pass} detail={detail} />
            ))}
          </div>
        )}
      </Section>
      <Separator />
    </>
  );
}

/** A graded answer, read only: its score by criterion and the note. */
function GradedSummary({ detail }: { detail: ManualGradingDetail }) {
  const grade = detail.manualGrade!;
  return (
    <Section title="Điểm đã chấm">
      <p className="text-sm font-medium tabular-nums">
        Tổng: {formatNumber(grade.finalScore, Number.isInteger(grade.finalScore) ? 0 : 2)} /{' '}
        {formatNumber(detail.maxPoints)} điểm · chấm lúc {formatDateTime(grade.gradedAt)}
      </p>
      <ol className="flex flex-col gap-1 text-sm">
        {grade.criteria.map((criterion) => (
          <li key={criterion.index} className="break-words tabular-nums">
            Tiêu chí {criterion.index + 1}: {formatNumber(criterion.points)} /{' '}
            {formatNumber(detail.rubric[criterion.index]?.maxPoints ?? 0)}
          </li>
        ))}
      </ol>
      {grade.note && <PlainText text={`Ghi chú: ${grade.note}`} />}
      <p className="text-sm text-muted-foreground">Điểm của câu đã chốt; muốn sửa thì đi qua phúc khảo.</p>
    </Section>
  );
}

function CloseFooter() {
  return (
    <SheetFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
      <SheetClose asChild>
        <Button variant="outline">Đóng</Button>
      </SheetClose>
    </SheetFooter>
  );
}

function SheetBody({ answerId, onSaved }: { answerId: number; onSaved: (result: ManualGradeResult) => void }) {
  const detail = useManualGradingDetail(answerId);

  if (detail.isPending) {
    return (
      <>
        <SheetHeader className="pr-12">
          <SheetTitle>Chấm câu tự luận</SheetTitle>
          <SheetDescription>Đang tải bài làm</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4" aria-busy="true">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <CloseFooter />
      </>
    );
  }
  if (detail.isError) {
    return (
      <>
        <SheetHeader className="pr-12">
          <SheetTitle>Chấm câu tự luận</SheetTitle>
          <SheetDescription>Không mở được bài làm</SheetDescription>
        </SheetHeader>
        <div className="px-4">
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Không tải được bài làm</AlertTitle>
            <AlertDescription>{apiErrorMessage(detail.error)}</AlertDescription>
            <AlertAction>
              <Button variant="outline" size="sm" onClick={() => void detail.refetch()}>
                Thử lại
              </Button>
            </AlertAction>
          </Alert>
        </div>
        <CloseFooter />
      </>
    );
  }

  const data = detail.data;
  const header = (
    <SheetHeader className="pr-12">
      <SheetTitle className="break-words">
        Bài #{data.sessionId} · Câu {data.questionNo}
      </SheetTitle>
      <SheetDescription className="break-words">
        {data.jdTitle}
        {data.companyName && ` · ${data.companyName}`} · Kỹ năng {data.skill} · Tối đa {formatNumber(data.maxPoints)} điểm
      </SheetDescription>
    </SheetHeader>
  );
  if (data.manualGrade) {
    return (
      <>
        {header}
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4">
          <AnswerSections detail={data} />
          <GradedSummary detail={data} />
        </div>
        <CloseFooter />
      </>
    );
  }
  return (
    <>
      {header}
      {/* A new row version (someone graded meanwhile) refills the form from the answer as it is now. */}
      <ManualGradeForm key={`${data.answerId}:${data.rowVersion}`} detail={data} onSaved={onSaved}>
        <AnswerSections detail={data} />
      </ManualGradeForm>
    </>
  );
}

/**
 * The grading pane of one answer (US-4.5 AC-2, AC-3, AC-6): a side sheet from `md`, a bottom sheet
 * on phones (DESIGN.md §5 item 7). The answer open is in the URL (`?answer=`).
 */
export function ManualGradeSheet({
  answerId,
  onClose,
  onSaved,
}: {
  answerId: number | null;
  onClose: () => void;
  onSaved: (result: ManualGradeResult) => void;
}) {
  const isMobile = useIsMobile();
  return (
    <Sheet open={answerId !== null} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={isMobile ? 'max-h-[85svh]' : 'data-[side=right]:md:max-w-2xl'}
      >
        {answerId !== null && <SheetBody key={answerId} answerId={answerId} onSaved={onSaved} />}
      </SheetContent>
    </Sheet>
  );
}
