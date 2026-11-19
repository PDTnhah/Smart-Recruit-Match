import {
  type BankQuestion,
  type CellCoverage,
  EXAM_PARTS,
  type ExamBlueprintView,
  type ExamPart,
  QUESTION_DIFFICULTIES,
  QUESTION_STATES,
  type QuestionDifficulty,
  type QuestionStatus,
  skillKey,
} from '@srm/shared';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, FileQuestion, SearchX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { bankQuestionsKey, useBankQuestions } from './api';
import { BankQuestionItem } from './bank-question-item';
import { cellLabel, DIFFICULTY_LABELS, EXAM_PART_TITLES, QUESTION_STATUS_LABELS } from './labels';
import { ShortAfterLockAlert } from './short-after-lock-alert';

/** Radix Select takes no empty value: "all" is a value of its own (DESIGN.md §6 `select`). */
const ALL = 'ALL';

interface Filters {
  part: ExamPart | typeof ALL;
  skill: string;
  difficulty: QuestionDifficulty | typeof ALL;
  status: QuestionStatus | typeof ALL;
  search: string;
}

const NO_FILTER: Filters = { part: ALL, skill: ALL, difficulty: ALL, status: ALL, search: '' };

/** Case and Unicode form do not matter when searching a stem. */
const normalise = (text: string) => text.normalize('NFC').toLocaleLowerCase('vi');

const cellKey = (question: Pick<BankQuestion, 'type' | 'skill' | 'difficulty'>) =>
  `${question.type}\u0000${skillKey(question.skill)}\u0000${question.difficulty}`;

interface CellGroup {
  key: string;
  skill: string;
  difficulty: QuestionDifficulty;
  inBlueprint: boolean;
  questions: BankQuestion[];
}

/** The questions by part, then by cell, in the order the API sends them (blueprint order). */
function groupsOf(questions: readonly BankQuestion[]): { part: ExamPart; cells: CellGroup[] }[] {
  return EXAM_PARTS.flatMap((part) => {
    const cells = new Map<string, CellGroup>();
    for (const question of questions) {
      if (question.part !== part) continue;
      const key = cellKey(question);
      const group = cells.get(key) ?? {
        key,
        skill: question.skill,
        difficulty: question.difficulty,
        inBlueprint: question.inBlueprint,
        questions: [],
      };
      group.questions.push(question);
      cells.set(key, group);
    }
    return cells.size === 0 ? [] : [{ part, cells: [...cells.values()] }];
  });
}

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * "Câu hỏi (N)" (US-4.11 AC-2): every question of the bank, by part then by cell (skill × difficulty), filtered by
 * part, skill, difficulty and status and searched by stem on the client (a bank holds at most 1 000 questions,
 * about 100 as a rule). The list is read again whenever the bank's view changes (a run's result, a lock, a
 * rejection), since the view polls while AI works: right away while the list is `active` (shown), else once it is
 * shown again.
 */
export function QuestionList({ view, active }: { view: ExamBlueprintView; active: boolean }) {
  const questions = useBankQuestions(view.jdId, view.bankId);
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>(NO_FILTER);
  // The view keeps its identity while a poll finds nothing new (structural sharing): only a real change reloads.
  const seenView = useRef(view);
  useEffect(() => {
    if (!active || seenView.current === view) return;
    seenView.current = view;
    void queryClient.invalidateQueries({ queryKey: bankQuestionsKey(view.jdId) });
  }, [view, active, queryClient]);

  const all = questions.data?.questions;
  const skills = useMemo(() => {
    const seen = new Map<string, string>();
    for (const question of all ?? []) if (!seen.has(skillKey(question.skill))) seen.set(skillKey(question.skill), question.skill);
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [all]);
  const shown = useMemo(() => {
    const search = normalise(filters.search.trim());
    return (all ?? []).filter(
      (question) =>
        (filters.part === ALL || question.part === filters.part) &&
        (filters.skill === ALL || skillKey(question.skill) === filters.skill) &&
        (filters.difficulty === ALL || question.difficulty === filters.difficulty) &&
        (filters.status === ALL || question.status === filters.status) &&
        (search === '' || normalise(question.stem).includes(search)),
    );
  }, [all, filters]);
  const coverage = useMemo(() => new Map<string, CellCoverage>(view.coverage.map((cell) => [cellKey(cell), cell])), [view.coverage]);

  if (questions.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (questions.isError) {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Không tải được danh sách câu hỏi</AlertTitle>
        <AlertDescription>{apiErrorMessage(questions.error)}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void questions.refetch()}>
            Thử lại
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  if (questions.data.questions.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileQuestion />
          </EmptyMedia>
          <EmptyTitle>Ngân hàng chưa có câu hỏi</EmptyTitle>
          <EmptyDescription>Bấm "Sinh câu còn thiếu" ở mục Tổng quan để AI sinh câu theo ma trận đề.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const running = view.run?.status === 'RUNNING' || view.validationRun?.status === 'RUNNING';
  const set = <K extends keyof Filters>(key: K) => (value: Filters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const filtered = shown.length !== questions.data.questions.length;
  return (
    <div className="flex flex-col gap-6">
      <ShortAfterLockAlert view={view} />
      <div className="flex flex-col gap-2">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            type="search"
            className="sm:col-span-2 lg:col-span-1"
            value={filters.search}
            onChange={(event) => set('search')(event.target.value)}
            placeholder="Tìm trong đề"
            aria-label="Tìm theo nội dung đề"
          />
          <FilterSelect
            label="Lọc theo phần"
            value={filters.part}
            onChange={set('part')}
            options={[{ value: ALL, label: 'Mọi phần' }, ...EXAM_PARTS.map((part) => ({ value: part, label: `Phần ${part}` }))]}
          />
          <FilterSelect
            label="Lọc theo kỹ năng"
            value={filters.skill}
            onChange={set('skill')}
            options={[{ value: ALL, label: 'Mọi kỹ năng' }, ...skills]}
          />
          <FilterSelect
            label="Lọc theo độ khó"
            value={filters.difficulty}
            onChange={set('difficulty')}
            options={[
              { value: ALL, label: 'Mọi độ khó' },
              ...QUESTION_DIFFICULTIES.map((difficulty) => ({ value: difficulty, label: DIFFICULTY_LABELS[difficulty] })),
            ]}
          />
          <FilterSelect
            label="Lọc theo trạng thái"
            value={filters.status}
            onChange={set('status')}
            options={[
              { value: ALL, label: 'Mọi trạng thái' },
              ...QUESTION_STATES.map((status) => ({ value: status, label: QUESTION_STATUS_LABELS[status] })),
            ]}
          />
        </div>
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {filtered
            ? `Hiện ${formatNumber(shown.length)} / ${formatNumber(questions.data.questions.length)} câu`
            : `${formatNumber(shown.length)} câu`}
        </p>
      </div>
      {shown.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>Không có câu nào khớp bộ lọc</EmptyTitle>
            <EmptyDescription>Đổi điều kiện lọc hoặc từ khóa tìm.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => setFilters(NO_FILTER)}>
              Xóa bộ lọc
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        groupsOf(shown).map(({ part, cells }) => (
          <section key={part} className="flex flex-col gap-4" aria-labelledby={`bank-questions-part-${part}`}>
            <h3 id={`bank-questions-part-${part}`} className="font-heading text-base font-medium">
              {EXAM_PART_TITLES[part]}
            </h3>
            {cells.map((cell) => (
              <section key={cell.key} className="flex flex-col gap-2" aria-label={cellLabel(cell.skill, cell.difficulty)}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h4 className="text-sm font-medium break-words">{cellLabel(cell.skill, cell.difficulty)}</h4>
                  <span className="text-sm text-muted-foreground tabular-nums">· {formatNumber(cell.questions.length)} câu</span>
                  {!cell.inBlueprint && <Badge variant="outline">Không còn trong ma trận</Badge>}
                </div>
                <ul className="flex flex-col gap-2">
                  {cell.questions.map((question) => (
                    <li key={question.id}>
                      <BankQuestionItem
                        jdId={view.jdId}
                        question={question}
                        locked={view.locked}
                        cell={coverage.get(cell.key)}
                        running={running}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
