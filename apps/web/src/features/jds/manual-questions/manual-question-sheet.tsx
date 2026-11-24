import {
  type ManualQuestionCell,
  type ManualQuestionInput,
  ManualQuestionInputSchema,
  MCQ_OPTION_COUNT,
  OPTION_LETTERS,
  QUESTION_IMPORT_DIFFICULTY_LABELS,
  QUESTION_IMPORT_TYPE_LABELS,
  QUESTION_TYPES,
  type QuestionType,
  RUBRIC_MAX_CRITERIA,
  RUBRIC_MAX_POINTS,
} from '@srm/shared';
import { CircleAlert, Plus, SquarePen, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, type FieldErrors, type Resolver, set, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatNumber } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { manualQuestionIssues, useSaveManualQuestions } from './api';

/** Values of the form: both types at once, so switching keeps what was typed; the resolver sends one. */
interface FormValues {
  type: QuestionType;
  /** `skill` and `difficulty` of a blueprint cell, joined by CELL_SEPARATOR; empty until one is picked. */
  cell: string;
  stem: string;
  options: string[];
  /** Index of the correct option as a string (RadioGroup); empty until one is picked. */
  correctOption: string;
  explanation: string;
  rubric: { criterion: string; maxPoints: string }[];
  sampleAnswer: string;
}

const CELL_SEPARATOR = '\u0000';

const cellValue = (cell: Pick<ManualQuestionCell, 'skill' | 'difficulty'>) => `${cell.skill}${CELL_SEPARATOR}${cell.difficulty}`;

const EMPTY: FormValues = {
  type: 'MCQ',
  cell: '',
  stem: '',
  options: Array.from({ length: MCQ_OPTION_COUNT }, () => ''),
  correctOption: '',
  explanation: '',
  rubric: [{ criterion: '', maxPoints: '' }],
  sampleAnswer: '',
};

/** A whole number as typed, NaN for anything else (the schema says "Điểm là số nguyên"), undefined when empty. */
const pointsOf = (text: string) => (text.trim() === '' ? undefined : /^\d+$/.test(text.trim()) ? Number(text) : Number.NaN);

/** The request body the form stands for. */
function inputOf(values: FormValues): unknown {
  const [skill = '', difficulty] = values.cell === '' ? [] : values.cell.split(CELL_SEPARATOR);
  const common = { skill, difficulty, stem: values.stem, explanation: values.explanation };
  if (values.type === 'MCQ') {
    return {
      type: 'MCQ',
      ...common,
      options: values.options,
      correctOption: values.correctOption === '' ? undefined : Number(values.correctOption),
    };
  }
  return {
    type: 'ESSAY',
    ...common,
    rubric: values.rubric.map((row) => ({ criterion: row.criterion, maxPoints: pointsOf(row.maxPoints) })),
    sampleAnswer: values.sampleAnswer,
  };
}

/** The form field a path of the request names: the cell picker stands for both skill and difficulty. */
const fieldOf = (path: string) => (path === 'skill' || path === 'difficulty' ? 'cell' : path === 'rubric' ? 'rubric.root' : path);

/** Runs the API's own schema (AGENTS › Invariant 14) on the body the form stands for (DESIGN.md §8). */
const resolver: Resolver<FormValues, unknown, ManualQuestionInput> = (values) => {
  const parsed = ManualQuestionInputSchema.safeParse(inputOf(values));
  if (parsed.success) return { values: parsed.data, errors: {} };
  const errors: FieldErrors<FormValues> = {};
  for (const issue of parsed.error.issues) {
    const name = fieldOf(issue.path.join('.') || 'type');
    if (name.split('.').reduce<unknown>((at, key) => (at as Record<string, unknown> | undefined)?.[key], errors)) continue;
    set(errors, name, { type: 'validate', message: issue.message });
  }
  return { values: {}, errors };
};

const cellLabel = (cell: ManualQuestionCell) =>
  `${cell.skill} – ${QUESTION_IMPORT_DIFFICULTY_LABELS[cell.difficulty]}`;

/**
 * "Thêm câu" (US-4.13 AC-1, AC-10): one question for a cell of the blueprint, multiple choice or essay, checked by
 * the API's schema before it is sent and by the bank's rules on the server (cell full, duplicate…), whose errors land
 * on the field they are about. A side sheet from `md`, a bottom sheet on phones (DESIGN.md §5 item 7). `cells` are
 * the blueprint's, with the room each has left.
 */
export function ManualQuestionSheet({
  jdId,
  cells,
  disabled,
}: {
  jdId: number;
  cells: readonly ManualQuestionCell[];
  disabled: boolean;
}) {
  const isMobile = useIsMobile();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const save = useSaveManualQuestions(jdId);
  const form = useForm<FormValues, unknown, ManualQuestionInput>({ resolver, defaultValues: EMPTY, mode: 'onTouched' });
  const rubric = useFieldArray({ control: form.control, name: 'rubric' });
  const type = useWatch({ control: form.control, name: 'type' });
  const points = useWatch({ control: form.control, name: 'rubric' });
  const pending = form.formState.isSubmitting;
  const typeCells = cells.filter((cell) => cell.type === type);
  const total = points.reduce((sum, row) => sum + (/^\d+$/.test(row.maxPoints.trim()) ? Number(row.maxPoints) : 0), 0);

  async function onSubmit(question: ManualQuestionInput) {
    setError(null);
    try {
      await save.mutateAsync({ origin: 'FORM', questions: [question] });
      setOpen(false);
      toast.success('Đã thêm câu vào ngân hàng');
    } catch (caught) {
      const issues = manualQuestionIssues(caught);
      for (const issue of issues.filter((entry) => entry.field !== null)) {
        form.setError(fieldOf(issue.field ?? '') as 'cell', { type: 'server', message: issue.message });
      }
      if (issues.length === 0 || issues.some((issue) => issue.field === null)) setError(caught);
    }
  }

  const fieldId = (name: string) => `${id}-${name}`;
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) {
          form.reset(EMPTY);
          setError(null);
        }
        setOpen(next);
      }}
    >
      <SheetTrigger asChild>
        <Button disabled={disabled}>
          <SquarePen data-icon="inline-start" />
          Thêm câu
        </Button>
      </SheetTrigger>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={isMobile ? 'max-h-[85svh]' : 'data-[side=right]:md:max-w-2xl'}
      >
        <form noValidate onSubmit={(event) => void form.handleSubmit(onSubmit)(event)} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader className="pr-12">
            <SheetTitle>Thêm câu hỏi</SheetTitle>
            <SheetDescription>
              Câu được dùng ngay cho bài test và tính vào độ phủ của ô. Trung tâm xem được mọi câu thêm tay và loại được
              câu sai.
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
            {error !== null && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>Chưa thêm được câu</AlertTitle>
                <AlertDescription>
                  {manualQuestionIssues(error).find((issue) => issue.field === null)?.message ?? apiErrorMessage(error)}
                </AlertDescription>
              </Alert>
            )}
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Controller
                  name="type"
                  control={form.control}
                  render={({ field }) => (
                    <Field>
                      <FieldLabel htmlFor={fieldId('type')}>Loại câu</FieldLabel>
                      <Select
                        value={field.value}
                        onValueChange={(next) => {
                          field.onChange(next);
                          form.setValue('cell', '');
                          form.clearErrors();
                        }}
                        disabled={pending}
                      >
                        <SelectTrigger id={fieldId('type')} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {QUESTION_TYPES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {QUESTION_IMPORT_TYPE_LABELS[value]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldDescription>{type === 'MCQ' ? 'Phần A của đề' : 'Phần B của đề'}</FieldDescription>
                    </Field>
                  )}
                />
                <Controller
                  name="cell"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={fieldId('cell')}>Ô của ma trận đề</FieldLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                        <SelectTrigger
                          id={fieldId('cell')}
                          className="w-full"
                          aria-invalid={fieldState.invalid}
                          onBlur={field.onBlur}
                        >
                          <SelectValue placeholder="Chọn kỹ năng và độ khó" />
                        </SelectTrigger>
                        <SelectContent>
                          {typeCells.map((cell) => (
                            <SelectItem key={cellValue(cell)} value={cellValue(cell)} disabled={cell.room === 0} textValue={cellLabel(cell)}>
                              <span className="flex flex-col">
                                <span className="break-words">{cellLabel(cell)}</span>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {cell.room === 0 ? 'Ô đã đủ câu' : `Còn nhận ${formatNumber(cell.room)} câu`}
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {typeCells.length === 0 && (
                        <FieldDescription>Ma trận đề chưa có ô {QUESTION_IMPORT_TYPE_LABELS[type].toLowerCase()}.</FieldDescription>
                      )}
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
              </div>
              <TextField form={form} name="stem" label="Đề" id={fieldId('stem')} rows={4} disabled={pending} />
              {type === 'MCQ' ? (
                <McqFields form={form} fieldId={fieldId} disabled={pending} />
              ) : (
                <FieldSet>
                  <FieldLegend variant="label">Rubric</FieldLegend>
                  <FieldDescription>
                    Từ 1 đến {RUBRIC_MAX_CRITERIA} tiêu chí, mỗi tiêu chí 1–{RUBRIC_MAX_POINTS} điểm nguyên.
                  </FieldDescription>
                  <ol className="flex flex-col gap-4">
                    {rubric.fields.map((row, index) => (
                      <li key={row.id} className="grid gap-2 sm:grid-cols-[1fr_6rem_auto] sm:items-start">
                        <TextField
                          form={form}
                          name={`rubric.${index}.criterion`}
                          label={`Tiêu chí ${index + 1}`}
                          id={fieldId(`criterion-${index}`)}
                          rows={2}
                          disabled={pending}
                        />
                        <Controller
                          name={`rubric.${index}.maxPoints`}
                          control={form.control}
                          render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                              <FieldLabel htmlFor={fieldId(`points-${index}`)}>Điểm</FieldLabel>
                              <Input
                                {...field}
                                id={fieldId(`points-${index}`)}
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={RUBRIC_MAX_POINTS}
                                aria-invalid={fieldState.invalid}
                                disabled={pending}
                              />
                              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                            </Field>
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="sm:mt-6"
                          aria-label={`Bỏ tiêu chí ${index + 1}`}
                          disabled={pending || rubric.fields.length === 1}
                          onClick={() => rubric.remove(index)}
                        >
                          <Trash2 />
                        </Button>
                      </li>
                    ))}
                  </ol>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending || rubric.fields.length >= RUBRIC_MAX_CRITERIA}
                      onClick={() => rubric.append({ criterion: '', maxPoints: '' })}
                    >
                      <Plus data-icon="inline-start" />
                      Thêm tiêu chí
                    </Button>
                    <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
                      Tổng: {formatNumber(total)} điểm
                    </p>
                  </div>
                  {form.formState.errors.rubric?.root?.message && (
                    <FieldError>{form.formState.errors.rubric.root.message}</FieldError>
                  )}
                  <TextField
                    form={form}
                    name="sampleAnswer"
                    label="Đáp án mẫu"
                    id={fieldId('sample')}
                    rows={4}
                    disabled={pending}
                  />
                </FieldSet>
              )}
              <TextField
                form={form}
                name="explanation"
                label="Giải thích"
                description={
                  type === 'MCQ'
                    ? 'Vì sao đáp án đúng. Chỉ cán bộ xem, sinh viên không thấy.'
                    : 'Câu kiểm tra điều gì, lỗi sinh viên hay mắc. Chỉ cán bộ xem.'
                }
                id={fieldId('explanation')}
                rows={3}
                disabled={pending}
              />
            </FieldGroup>
          </div>
          <SheetFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Thêm câu
            </Button>
            <SheetClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Hủy
              </Button>
            </SheetClose>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

type Form = ReturnType<typeof useForm<FormValues, unknown, ManualQuestionInput>>;

type TextName = 'stem' | 'explanation' | 'sampleAnswer' | `rubric.${number}.criterion`;

function TextField({
  form,
  name,
  label,
  description,
  id,
  rows,
  disabled,
}: {
  form: Form;
  name: TextName;
  label: string;
  description?: string;
  id: string;
  rows: number;
  disabled: boolean;
}) {
  return (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Textarea {...field} id={id} rows={rows} aria-invalid={fieldState.invalid} disabled={disabled} />
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}

/** Four options and the correct one (DESIGN.md §6 › radio-group). */
function McqFields({ form, fieldId, disabled }: { form: Form; fieldId: (name: string) => string; disabled: boolean }) {
  return (
    <>
      <FieldSet>
        <FieldLegend variant="label">Phương án</FieldLegend>
        <div className="grid gap-4 sm:grid-cols-2">
          {OPTION_LETTERS.map((letter, index) => (
            <Controller
              key={letter}
              name={`options.${index}`}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={fieldId(`option-${index}`)}>Phương án {letter}</FieldLabel>
                  <Input {...field} id={fieldId(`option-${index}`)} aria-invalid={fieldState.invalid} disabled={disabled} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          ))}
        </div>
      </FieldSet>
      <Controller
        name="correctOption"
        control={form.control}
        render={({ field, fieldState }) => (
          <FieldSet data-invalid={fieldState.invalid}>
            <FieldLegend variant="label">Đáp án đúng</FieldLegend>
            <RadioGroup
              value={field.value}
              onValueChange={field.onChange}
              disabled={disabled}
              className="grid grid-cols-4 gap-2"
              aria-invalid={fieldState.invalid}
            >
              {OPTION_LETTERS.map((letter, index) => (
                <FieldLabel key={letter} htmlFor={fieldId(`correct-${index}`)} className="pointer-coarse:min-h-11">
                  <Field orientation="horizontal">
                    <RadioGroupItem value={String(index)} id={fieldId(`correct-${index}`)} />
                    <FieldContent>{letter}</FieldContent>
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </FieldSet>
        )}
      />
    </>
  );
}
