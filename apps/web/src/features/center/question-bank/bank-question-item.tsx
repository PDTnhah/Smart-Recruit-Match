import type { BankQuestion, CellCoverage, QuestionStatus } from '@srm/shared';
import { Bot, ChevronRight, CircleCheck, CircleDashed, CircleMinus, CircleX, UserX } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { OPTION_LETTERS, QuestionBody, QuestionSection, QuestionText } from '@/features/jds/question-review/question-body';
import { formatDateTime } from '@/lib/format';
import { IconBadge, type IconBadgeStyle } from '@/shared/ui/icon-badge';
import { DIFFICULTY_LABELS, QUESTION_STATUS_LABELS, REJECT_REASON_LABELS } from './labels';
import { RejectQuestionDialog } from './reject-question-dialog';

/** DESIGN.md §6 › badge: where a question of the bank stands (US-4.11 AC-2). */
const STATUS_STYLE: Readonly<Record<QuestionStatus, IconBadgeStyle>> = {
  DRAFT: { variant: 'outline', icon: CircleDashed },
  VALIDATED: { variant: 'default', icon: CircleCheck },
  REJECTED: { variant: 'outline', icon: CircleX },
  RETIRED: { variant: 'outline', icon: CircleMinus },
};

const USABLE: ReadonlySet<QuestionStatus> = new Set(['DRAFT', 'VALIDATED']);

const reasonsText = (reasons: readonly (keyof typeof REJECT_REASON_LABELS)[]) =>
  reasons.map((reason) => REJECT_REASON_LABELS[reason]).join(', ');

/** Who took the question out and why, in one line under the stem. */
function RemovalLine({ question }: { question: BankQuestion }) {
  if (question.manualRejection) {
    return <span>Trung tâm loại: {REJECT_REASON_LABELS[question.manualRejection.reason]}</span>;
  }
  if (question.status === 'REJECTED' && question.aiCheck) return <span>AI loại: {reasonsText(question.aiCheck.reasons)}</span>;
  return null;
}

/** The Validator's verdict (US-4.10), with the model and prompt that gave it (AGENTS › Invariant 12). */
function AiCheck({ question }: { question: BankQuestion }) {
  const check = question.aiCheck;
  if (!check) {
    return (
      <QuestionSection title="Kiểm bằng AI">
        <p className="text-sm text-muted-foreground">Chưa kiểm. Bài test vẫn rút câu này.</p>
      </QuestionSection>
    );
  }
  const solved = check.correctOptions?.map((index) => OPTION_LETTERS[index] ?? String(index + 1)).join(', ');
  return (
    <QuestionSection title="Kiểm bằng AI">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Kết quả</dt>
        <dd>{check.status === 'VALIDATED' ? 'Đạt' : `Loại: ${reasonsText(check.reasons)}`}</dd>
        {question.type === 'MCQ' && (
          <>
            <dt className="text-muted-foreground">AI tự giải</dt>
            <dd>{solved ? `Phương án ${solved}` : 'Không giải'}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Độ khó ước lượng</dt>
        <dd>{check.estimatedDifficulty ? DIFFICULTY_LABELS[check.estimatedDifficulty] : '–'}</dd>
      </dl>
      {check.note && <QuestionText muted>{check.note}</QuestionText>}
      <p className="text-xs break-words text-muted-foreground">
        {check.model} · {check.promptVersion}
      </p>
    </QuestionSection>
  );
}

function ManualRejection({ rejection }: { rejection: NonNullable<BankQuestion['manualRejection']> }) {
  return (
    <Alert>
      <UserX />
      <AlertTitle className="break-words">
        Trung tâm loại: {REJECT_REASON_LABELS[rejection.reason]} · {rejection.rejectedBy.name} lúc{' '}
        {formatDateTime(rejection.rejectedAt)}
      </AlertTitle>
      {rejection.note && (
        <AlertDescription>
          <QuestionText>{rejection.note}</QuestionText>
        </AlertDescription>
      )}
    </Alert>
  );
}

/**
 * One question of the bank (US-4.11 AC-2, AC-3): collapsed to its stem, its status and why it was taken out; open,
 * the whole question with the correct option highlighted, the AI check, CENTER's rejection, who wrote it, and
 * "Loại câu" while it is usable. The content mounts only while open, so a long list stays light.
 */
export function BankQuestionItem({
  jdId,
  question,
  locked,
  cell,
  running,
}: {
  jdId: number;
  question: BankQuestion;
  locked: boolean;
  cell: CellCoverage | undefined;
  /** A generation or AI check is RUNNING: no question may be rejected meanwhile (409). */
  running: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label = `câu #${question.id}`;
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
                <span className="sr-only">Câu #{question.id}: </span>
                {question.stem}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <IconBadge style={STATUS_STYLE[question.status]}>{QUESTION_STATUS_LABELS[question.status]}</IconBadge>
                <span className="tabular-nums">#{question.id}</span>
                <RemovalLine question={question} />
              </span>
            </span>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="flex flex-col gap-4">
            <QuestionBody question={question} showStem={false} />
            {question.manualRejection && <ManualRejection rejection={question.manualRejection} />}
            <AiCheck question={question} />
            <p className="flex flex-wrap items-center gap-x-2 text-xs break-words text-muted-foreground">
              <Bot aria-hidden="true" className="size-3.5" />
              Sinh bởi {question.model} · {question.promptVersion} · {formatDateTime(question.createdAt)}
            </p>
          </CardContent>
          {USABLE.has(question.status) && (
            <CardFooter className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
              {running && (
                <p className="text-sm text-muted-foreground">AI đang sinh hoặc kiểm câu: loại câu được khi lượt chạy xong.</p>
              )}
              <RejectQuestionDialog
                jdId={jdId}
                question={question}
                label={label}
                locked={locked}
                cell={cell}
                disabled={running}
              />
            </CardFooter>
          )}
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
