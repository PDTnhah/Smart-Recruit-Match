import { EXAM_PARTS, type ExamAnswerValue, type ExamQuestion } from '@srm/shared';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PART_LABELS } from './labels';
import { isAnswered } from './use-exam-autosave';

interface QuestionGridProps {
  questions: readonly ExamQuestion[];
  answers: ReadonlyMap<number, ExamAnswerValue>;
  /** Index of the question shown. */
  current: number;
  onSelect: (index: number) => void;
  footer: ReactNode;
}

/** Every question by number, per part: answered ones filled, the one shown ringed. */
export function QuestionGrid({ questions, answers, current, onSelect, footer }: QuestionGridProps) {
  const answered = questions.filter((question) => isAnswered(answers.get(question.questionId))).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Danh sách câu</h2>
        </CardTitle>
        <CardDescription>
          Đã trả lời {answered}/{questions.length} câu. Câu đã trả lời có nền màu.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {EXAM_PARTS.map((part) => {
          const items = questions.flatMap((question, index) => (question.part === part ? [{ question, index }] : []));
          if (items.length === 0) return null;
          return (
            <section key={part} aria-label={PART_LABELS[part]} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{PART_LABELS[part]}</h3>
              <ol className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-2">
                {items.map(({ question, index }) => {
                  const done = isAnswered(answers.get(question.questionId));
                  return (
                    <li key={question.questionId}>
                      <Button
                        variant={done ? 'default' : 'outline'}
                        size="icon"
                        className="w-full tabular-nums aria-[current=step]:ring-3 aria-[current=step]:ring-ring/50"
                        aria-current={index === current ? 'step' : undefined}
                        aria-label={`Câu ${question.no}, ${done ? 'đã trả lời' : 'chưa trả lời'}`}
                        onClick={() => onSelect(index)}
                      >
                        {question.no}
                      </Button>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </CardContent>
      <CardFooter className="flex justify-end">{footer}</CardFooter>
    </Card>
  );
}
