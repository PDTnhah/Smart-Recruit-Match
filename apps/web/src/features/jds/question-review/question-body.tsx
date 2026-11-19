import type { SampleQuestion } from '@srm/shared';
import { CircleCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatNumber } from '@/lib/format';
import { IconBadge } from '@/shared/ui/icon-badge';

// What a question says and how it is graded, as staff read it (US-4.9 AC-6, US-4.11 AC-2): the sample review
// and CENTER's list of the whole bank show a question the same way. Answer keys: HR and CENTER only.

export const OPTION_LETTERS = 'ABCDEFGH';

/** Plain text written by AI: never rendered as Markdown or HTML (DESIGN.md §6 › sheet). */
export function QuestionText({ children, muted = false }: { children: string; muted?: boolean }) {
  return (
    <p className={muted ? 'text-sm whitespace-pre-wrap break-words text-muted-foreground' : 'whitespace-pre-wrap break-words'}>
      {children}
    </p>
  );
}

export function QuestionSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-sm font-medium">{title}</h4>
      {children}
    </div>
  );
}

type QuestionContent = Pick<
  SampleQuestion,
  'type' | 'stem' | 'options' | 'correctOption' | 'explanation' | 'sampleAnswer' | 'rubric'
>;

function Options({ question }: { question: QuestionContent }) {
  return (
    <ol className="flex flex-col gap-2" aria-label="Phương án">
      {(question.options ?? []).map((option, index) => {
        const correct = index === question.correctOption;
        return (
          <li
            key={index}
            className={
              correct
                ? 'flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-primary bg-muted p-3'
                : 'flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border p-3'
            }
          >
            <span className="font-medium">{OPTION_LETTERS[index]}.</span>
            <span className={correct ? 'min-w-0 flex-1 font-medium break-words whitespace-pre-wrap' : 'min-w-0 flex-1 break-words whitespace-pre-wrap'}>
              {option}
            </span>
            {correct && <IconBadge style={{ variant: 'default', icon: CircleCheck }}>Đáp án đúng</IconBadge>}
          </li>
        );
      })}
    </ol>
  );
}

function Rubric({ rubric }: { rubric: NonNullable<SampleQuestion['rubric']> }) {
  const total = rubric.reduce((sum, criterion) => sum + criterion.max_points, 0);
  return (
    <QuestionSection title="Rubric">
      <ol className="flex flex-col gap-1 text-sm">
        {rubric.map((criterion, index) => (
          <li key={index} className="flex flex-wrap justify-between gap-x-4">
            <span className="min-w-0 break-words">
              Tiêu chí {index + 1}: {criterion.criterion}
            </span>
            <span className="text-muted-foreground tabular-nums">tối đa {formatNumber(criterion.max_points)} điểm</span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground tabular-nums">Tổng: {formatNumber(total)} điểm</p>
    </QuestionSection>
  );
}

/**
 * The stem, then the options with the correct one highlighted and labelled, or the model answer of an essay; the
 * explanation; an essay's rubric. `showStem` false when the stem is already shown (a collapsed row's trigger).
 */
export function QuestionBody({ question, showStem = true }: { question: QuestionContent; showStem?: boolean }) {
  return (
    <>
      {showStem && <QuestionText>{question.stem}</QuestionText>}
      {question.type === 'MCQ' ? (
        <Options question={question} />
      ) : (
        <QuestionSection title="Đáp án mẫu">
          <QuestionText muted>{question.sampleAnswer ?? ''}</QuestionText>
        </QuestionSection>
      )}
      {question.explanation && (
        <QuestionSection title="Giải thích">
          <QuestionText muted>{question.explanation}</QuestionText>
        </QuestionSection>
      )}
      {question.rubric && <Rubric rubric={question.rubric} />}
    </>
  );
}
