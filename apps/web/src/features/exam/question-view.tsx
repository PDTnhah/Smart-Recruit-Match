import { EXAM_ESSAY_MAX_LENGTH, type ExamAnswerValue, type ExamOption, type ExamQuestion } from '@srm/shared';
import type { Ref } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { formatNumber } from '@/lib/format';
import { optionLetter, PART_LABELS } from './labels';
import type { AnswerChange } from './use-exam-autosave';

interface QuestionViewProps {
  question: ExamQuestion;
  total: number;
  answer: ExamAnswerValue | undefined;
  /** Time is up or the paper is being submitted: answers can no longer change. */
  locked: boolean;
  onAnswer: (answer: AnswerChange) => void;
  /** The heading, focused when the student moves to another question. */
  headingRef?: Ref<HTMLHeadingElement>;
}

/** One question of the paper: its stem, then the options or the essay box. */
export function QuestionView({ question, total, answer, locked, onAnswer, headingRef }: QuestionViewProps) {
  const stemId = `question-${question.questionId}-stem`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 ref={headingRef} tabIndex={-1} className="outline-none">
            Câu {question.no}/{total}
          </h2>
        </CardTitle>
        <CardDescription>{PART_LABELS[question.part]}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p id={stemId} className="break-words whitespace-pre-wrap">
          {question.stem}
        </p>
        {question.options ? (
          <ChoiceAnswer
            questionId={question.questionId}
            options={question.options}
            selected={answer && 'optionCode' in answer ? answer.optionCode : undefined}
            locked={locked}
            stemId={stemId}
            onAnswer={onAnswer}
          />
        ) : (
          <EssayAnswer
            questionId={question.questionId}
            text={answer && 'text' in answer ? answer.text : ''}
            locked={locked}
            stemId={stemId}
            onAnswer={onAnswer}
          />
        )}
      </CardContent>
    </Card>
  );
}

interface ChoiceAnswerProps {
  questionId: number;
  options: readonly ExamOption[];
  selected: string | undefined;
  locked: boolean;
  stemId: string;
  onAnswer: (answer: AnswerChange) => void;
}

/** Multiple choice as option cards (DESIGN.md §6 `radio-group`); letters follow the order shown. */
function ChoiceAnswer({ questionId, options, selected, locked, stemId, onAnswer }: ChoiceAnswerProps) {
  return (
    <FieldSet className="gap-3">
      <FieldLegend variant="label" className="sr-only">
        Chọn một phương án
      </FieldLegend>
      <RadioGroup
        value={selected ?? ''}
        onValueChange={(optionCode) => onAnswer({ optionCode })}
        disabled={locked}
        aria-labelledby={stemId}
      >
        {options.map((option, index) => {
          const id = `question-${questionId}-option-${index}`;
          return (
            <FieldLabel key={option.code} htmlFor={id} className="pointer-coarse:min-h-11">
              <Field orientation="horizontal" data-disabled={locked || undefined}>
                <RadioGroupItem value={option.code} id={id} />
                <FieldContent className="min-w-0">
                  <span className="break-words whitespace-pre-wrap">
                    <span className="font-medium">{optionLetter(index)}.</span> {option.text}
                  </span>
                </FieldContent>
              </Field>
            </FieldLabel>
          );
        })}
      </RadioGroup>
      {selected && !locked && (
        <Button variant="ghost" className="self-start" onClick={() => onAnswer(null)}>
          Bỏ chọn
        </Button>
      )}
    </FieldSet>
  );
}

interface EssayAnswerProps {
  questionId: number;
  text: string;
  locked: boolean;
  stemId: string;
  onAnswer: (answer: AnswerChange) => void;
}

/** An essay, at most EXAM_ESSAY_MAX_LENGTH characters; an empty box clears the answer. */
function EssayAnswer({ questionId, text, locked, stemId, onAnswer }: EssayAnswerProps) {
  const id = `question-${questionId}-answer`;
  const countId = `${id}-count`;
  return (
    <Field data-disabled={locked || undefined}>
      <FieldLabel htmlFor={id}>Câu trả lời</FieldLabel>
      <Textarea
        id={id}
        value={text}
        maxLength={EXAM_ESSAY_MAX_LENGTH}
        disabled={locked}
        aria-describedby={`${stemId} ${countId}`}
        className="min-h-48"
        onChange={(event) => onAnswer(event.target.value === '' ? null : { text: event.target.value })}
      />
      <FieldDescription id={countId} className="tabular-nums">
        {formatNumber(text.length)}/{formatNumber(EXAM_ESSAY_MAX_LENGTH)} ký tự
      </FieldDescription>
    </Field>
  );
}
