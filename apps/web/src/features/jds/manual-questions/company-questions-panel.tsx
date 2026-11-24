import type { ManualQuestion, QuestionStatus } from '@srm/shared';
import { ChevronRight, CircleAlert, CircleCheck, CircleMinus, CircleX, FileQuestion, Hourglass } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { cellLabel, REJECT_REASON_LABELS } from '@/features/center/question-bank/labels';
import { QuestionBody, QuestionText } from '@/features/jds/question-review/question-body';
import { formatDateTime, formatNumber } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { IconBadge, type IconBadgeStyle } from '@/shared/ui/icon-badge';
import { useManualQuestions } from './api';
import { ManualQuestionActions } from './manual-question-actions';

/** DESIGN.md §6 › badge: a question HR added, as HR reads it (US-4.13 AC-7). Checked or not, it is in use. */
const STATUS: Readonly<Record<QuestionStatus, { label: string; style: IconBadgeStyle }>> = {
  DRAFT: { label: 'Đang dùng', style: { variant: 'default', icon: CircleCheck } },
  VALIDATED: { label: 'Đang dùng', style: { variant: 'default', icon: CircleCheck } },
  REJECTED: { label: 'Bị loại', style: { variant: 'outline', icon: CircleX } },
  RETIRED: { label: 'Ngừng dùng', style: { variant: 'outline', icon: CircleMinus } },
};

function CompanyQuestionItem({ question }: { question: ManualQuestion }) {
  const [open, setOpen] = useState(false);
  const status = STATUS[question.status];
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <Card size="sm">
        <CardHeader>
          <CollapsibleTrigger className="group/question flex w-full items-start gap-3 rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:min-h-11">
            <ChevronRight
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/question:rotate-90"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="line-clamp-2 break-words whitespace-pre-wrap group-data-[state=open]/question:line-clamp-none">
                {question.stem}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <IconBadge style={status.style}>{status.label}</IconBadge>
                <span>Phần {question.part} · {cellLabel(question.skill, question.difficulty)}</span>
                {question.rejection && <span>Trung tâm loại: {REJECT_REASON_LABELS[question.rejection.reason]}</span>}
              </span>
            </span>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="flex flex-col gap-4">
            <QuestionBody question={question} showStem={false} />
            {question.rejection && (
              <Alert>
                <CircleX />
                <AlertTitle className="break-words">
                  Trung tâm loại: {REJECT_REASON_LABELS[question.rejection.reason]} lúc {formatDateTime(question.rejection.rejectedAt)}
                </AlertTitle>
                {question.rejection.note && (
                  <AlertDescription>
                    <QuestionText>{question.rejection.note}</QuestionText>
                  </AlertDescription>
                )}
              </Alert>
            )}
            <p className="text-xs break-words text-muted-foreground">
              Thêm bởi {question.createdBy.name} · {formatDateTime(question.createdAt)}
            </p>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/**
 * "Câu hỏi của công ty" (US-4.13 AC-7, AC-10): the questions HR of the company added to the JD's bank, with their
 * status and why the career centre rejected one, and "Thêm câu" / "Import file" while the bank is open. HR never sees
 * the AI's questions nor the centre's (CONTEXT D62).
 */
export function CompanyQuestionsPanel({ jdId, readOnly }: { jdId: number; readOnly: boolean }) {
  const list = useManualQuestions(jdId);

  if (list.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-10 w-64 max-w-full" />
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (list.isError) {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Không tải được câu hỏi của công ty</AlertTitle>
        <AlertDescription>{apiErrorMessage(list.error)}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
            Thử lại
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  const { bank, cells, questions } = list.data;
  if (!bank) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Hourglass />
          </EmptyMedia>
          <EmptyTitle>Ngân hàng câu hỏi đang được tạo</EmptyTitle>
          <EmptyDescription>Ngân hàng của JD được tạo sau khi JD được duyệt. Tải lại trang sau ít phút.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Câu công ty thêm được dùng ngay trong bài test của JD, cùng với câu AI sinh. Trung tâm xem mọi câu và có thể
          loại câu sai.
        </p>
        <ManualQuestionActions
          jdId={jdId}
          cells={cells}
          locked={bank.status === 'LOCKED'}
          readOnly={readOnly}
          outdated={bank.jdOutdated}
        />
      </div>
      {questions.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileQuestion />
            </EmptyMedia>
            <EmptyTitle>Công ty chưa thêm câu nào</EmptyTitle>
            <EmptyDescription>
              Thêm từng câu bằng form, hoặc điền file mẫu rồi import nhiều câu một lần.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <section className="flex flex-col gap-2" aria-labelledby={`company-questions-${jdId}`}>
          <h3 id={`company-questions-${jdId}`} className="font-heading text-base font-medium">
            Câu đã thêm <span className="tabular-nums">({formatNumber(questions.length)})</span>
          </h3>
          <ul className="flex flex-col gap-2">
            {questions.map((question) => (
              <li key={question.id}>
                <CompanyQuestionItem question={question} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
