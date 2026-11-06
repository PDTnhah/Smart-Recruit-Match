import {
  ESSAY_QUESTIONS,
  EXAM_MAX_DURATION_MINUTES,
  EXAM_PART_MAX_QUESTIONS,
  EXAM_PARTS,
  type ExamBlueprint,
  type ExamBlueprintView,
  type ExamPart,
  examBlueprintRequestSchema,
  QUESTION_DIFFICULTIES,
} from '@srm/shared';
import { CircleAlert, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { type Control, Controller, type Path, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatNumber } from '@/lib/format';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { serverValidationIssues } from '@/shared/forms/server-errors';
import { useUpdateExamBlueprint } from './api';
import {
  type BlueprintFormValues,
  blueprintResolver,
  formValuesOf,
  type MatrixRow,
  matrixRows,
  serverBlueprintIssues,
} from './blueprint-form-values';
import { cellLabel, DIFFICULTY_LABELS, EXAM_PART_TITLES } from './labels';

type FormPath = Path<BlueprintFormValues>;
type FormControl = Control<BlueprintFormValues, unknown, ExamBlueprint>;

/** A count the user cleared is NaN until filled again; it adds nothing to a total. */
const countOf = (value: number | undefined) => (value !== undefined && Number.isFinite(value) ? value : 0);

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/** NaN while the input is empty: the schema reports a required number; an empty cell means 0. */
const numberOf = (input: HTMLInputElement) => (input.value === '' ? Number.NaN : input.valueAsNumber);

interface BlueprintFormProps {
  view: ExamBlueprintView;
  /** Leaves the editor, after saving or on "Hủy". */
  onDone: () => void;
  /** After a 409 on row_version: reads the view again; the panel mounts a fresh form. */
  onReload: () => Promise<void>;
  /** Reads the view again and stays (the bank was locked or a run started meanwhile). */
  onRefresh: () => void;
}

/**
 * Edit the exam blueprint of a JD (BR-05, US-4.1 AC-2, AC-3) as a skill × difficulty matrix per
 * part, checked with the schema the API uses (`examBlueprintRequestSchema` with the JD's
 * requirements). The form keeps what it loaded, row_version included (LESSONS §25): polling or a
 * refetch of the view does not reset it.
 */
export function BlueprintForm({ view, onDone, onReload, onRefresh }: BlueprintFormProps) {
  const [loaded] = useState(() => {
    const rows = matrixRows(view.blueprint, view.requirements);
    return {
      rowVersion: view.rowVersion,
      rows,
      defaults: formValuesOf(view.blueprint, rows),
      resolver: blueprintResolver(examBlueprintRequestSchema(view.requirements), rows),
    };
  });
  const update = useUpdateExamBlueprint(view.jdId);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);

  const form = useForm<BlueprintFormValues, unknown, ExamBlueprint>({
    resolver: loaded.resolver,
    defaultValues: loaded.defaults,
    mode: 'onTouched',
  });

  async function onSave(blueprint: ExamBlueprint) {
    setFormError(null);
    try {
      await update.mutateAsync({ rowVersion: loaded.rowVersion, blueprint });
      toast.success('Đã lưu ma trận đề. Bấm "Sinh câu còn thiếu" nếu còn ô chưa đủ câu nháp.');
      onDone();
    } catch (error) {
      const code = error instanceof ApiRequestError ? error.body?.code : undefined;
      if (code === 'ROW_VERSION_CONFLICT') {
        setConflict(true);
        return;
      }
      // A 400: the JD's requirements changed since the form was loaded.
      let applied = false;
      for (const issue of serverBlueprintIssues(serverValidationIssues(error), form.getValues(), loaded.rows)) {
        if (issue.name === 'root') continue;
        form.setError(issue.name as FormPath, { type: 'server', message: issue.message }, { shouldFocus: !applied });
        applied = true;
      }
      if (applied) return;
      setFormError(apiErrorMessage(error));
      if (code === 'QUESTION_GENERATION_RUNNING' || code === 'QUESTION_BANK_LOCKED') onRefresh();
    }
  }

  async function reload() {
    setReloading(true);
    try {
      await onReload();
    } finally {
      setReloading(false);
    }
  }

  const error = formError ?? form.formState.errors.root?.message;

  return (
    <form
      noValidate
      onSubmit={(event) => void form.handleSubmit(onSave)(event)}
      className="flex flex-col gap-6"
      aria-label="Sửa ma trận đề"
    >
      {conflict && (
        <Alert variant="destructive">
          <RefreshCw />
          <AlertTitle>Ma trận đề vừa được cập nhật ở nơi khác</AlertTitle>
          <AlertDescription>
            Thay đổi trên màn này chưa được lưu. Tải bản mới nhất để xem thay đổi, rồi sửa lại nếu cần.
          </AlertDescription>
          <AlertAction>
            <Button type="button" variant="outline" size="sm" onClick={() => void reload()} disabled={reloading}>
              {reloading && <Spinner data-icon="inline-start" />}
              Tải bản mới nhất
            </Button>
          </AlertAction>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Chưa lưu được ma trận đề</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <FieldGroup>
        <NumberField
          control={form.control}
          name="duration_minutes"
          id="blueprint-duration"
          label="Thời gian làm bài (phút)"
          description="Mặc định theo thời gian làm bài của đợt thực tập."
          max={EXAM_MAX_DURATION_MINUTES}
        />
      </FieldGroup>

      {EXAM_PARTS.map((part) => (
        <PartFields key={part} control={form.control} part={part} rows={loaded.rows} />
      ))}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onDone} disabled={update.isPending}>
          Hủy
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending && <Spinner data-icon="inline-start" />}
          Lưu ma trận đề
        </Button>
      </div>
    </form>
  );
}

function PartFields({ control, part, rows }: { control: FormControl; part: ExamPart; rows: readonly MatrixRow[] }) {
  return (
    <FieldSet>
      <FieldLegend>{EXAM_PART_TITLES[part]}</FieldLegend>
      <FieldDescription>
        {part === 'A'
          ? 'Mỗi đề rút đúng số câu ghi ở từng ô.'
          : `Từ ${ESSAY_QUESTIONS.min} đến ${ESSAY_QUESTIONS.max} câu tự luận mỗi đề, chấm theo rubric.`}
      </FieldDescription>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          control={control}
          name={`parts.${part}.weight_percent`}
          id={`blueprint-${part}-weight`}
          label="Tỷ trọng trong điểm bài test (%)"
          max={100}
          // The shared schema reports "the weights add up to 100" on part B (LESSONS §26).
          deps={part === 'A' ? ['parts.B.weight_percent'] : undefined}
        />
        <NumberField
          control={control}
          name={`parts.${part}.question_count`}
          id={`blueprint-${part}-count`}
          label="Số câu mỗi đề"
          max={EXAM_PART_MAX_QUESTIONS}
        />
      </div>
      <MatrixInputs control={control} part={part} rows={rows} />
    </FieldSet>
  );
}

/** The cells of a part as a matrix of count inputs, with the totals of each row and column. */
function MatrixInputs({ control, part, rows }: { control: FormControl; part: ExamPart; rows: readonly MatrixRow[] }) {
  const counts = useWatch({ control, name: `parts.${part}.counts` });
  const at = (row: number, difficulty: number) => countOf(counts[row]?.[difficulty]);
  const columnTotals = QUESTION_DIFFICULTIES.map((_, difficulty) => sum(rows.map((_, row) => at(row, difficulty))));
  const unknown = rows.some((row) => !row.known);

  return (
    <Table>
      <TableCaption className="text-left">
        Để 0 ở ô không hỏi. Tổng các ô phải bằng số câu mỗi đề.
        {unknown && ' Kỹ năng không còn trong yêu cầu của JD phải đặt về 0.'}
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-36">Kỹ năng</TableHead>
          {QUESTION_DIFFICULTIES.map((difficulty) => (
            <TableHead key={difficulty}>{DIFFICULTY_LABELS[difficulty]}</TableHead>
          ))}
          <TableHead className="text-right">Tổng</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, rowIndex) => (
          <TableRow key={row.key} className="align-top">
            <TableCell className="whitespace-normal">
              <div className="flex flex-col items-start gap-1">
                <span className="font-medium break-words">{row.skill}</span>
                {!row.known && <Badge variant="outline">Không còn trong yêu cầu</Badge>}
              </div>
            </TableCell>
            {QUESTION_DIFFICULTIES.map((difficulty, difficultyIndex) => (
              <TableCell key={difficulty} className="whitespace-normal">
                <Controller
                  name={`parts.${part}.counts.${rowIndex}.${difficultyIndex}`}
                  control={control}
                  // The sum of the cells is checked against the part's question count (LESSONS §26).
                  rules={{ deps: [`parts.${part}.question_count`] }}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid} className="min-w-20">
                      <Input
                        name={field.name}
                        ref={field.ref}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={EXAM_PART_MAX_QUESTIONS}
                        step={1}
                        value={Number.isNaN(field.value) ? '' : field.value}
                        onChange={(event) => field.onChange(numberOf(event.target))}
                        onBlur={field.onBlur}
                        aria-label={`Số câu ${cellLabel(row.skill, difficulty)}, phần ${part}`}
                        aria-invalid={fieldState.invalid}
                        className="w-20 tabular-nums"
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
              </TableCell>
            ))}
            <TableCell className="text-right tabular-nums">
              {formatNumber(sum(QUESTION_DIFFICULTIES.map((_, difficulty) => at(rowIndex, difficulty))))}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Tổng</TableCell>
          {columnTotals.map((total, index) => (
            <TableCell key={QUESTION_DIFFICULTIES[index]} className="tabular-nums">
              {formatNumber(total)}
            </TableCell>
          ))}
          <TableCell className="text-right tabular-nums">{formatNumber(sum(columnTotals))}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

interface NumberFieldProps {
  control: FormControl;
  name: FormPath;
  id: string;
  label: string;
  description?: string;
  max: number;
  /** Fields whose error depends on this one, checked again when it changes. */
  deps?: FormPath[];
}

function NumberField({ control, name, id, label, description, max, deps }: NumberFieldProps) {
  return (
    <Controller
      name={name}
      control={control}
      rules={deps ? { deps } : undefined}
      render={({ field, fieldState }) => {
        const value = field.value as number;
        return (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Input
              id={id}
              name={field.name}
              ref={field.ref}
              type="number"
              inputMode="numeric"
              min={0}
              max={max}
              step={1}
              value={Number.isNaN(value) ? '' : value}
              onChange={(event) => field.onChange(numberOf(event.target))}
              onBlur={field.onBlur}
              aria-invalid={fieldState.invalid}
              className="tabular-nums"
            />
            {description && <FieldDescription>{description}</FieldDescription>}
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        );
      }}
    />
  );
}
