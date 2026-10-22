import { zodResolver } from '@hookform/resolvers/zod';
import {
  type JdRequirements,
  type JdRequirementsView,
  POSITION_GROUPS,
  type PositionGroup,
  SaveJdRequirementsRequestSchema,
  type SaveJdRequirementsRequest,
  SKILL_LEVELS,
  SKILL_WEIGHT_MAX,
} from '@srm/shared';
import { ArrowDownUp, CircleAlert, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, type UseFieldArrayReturn, useFieldArray, useForm, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet, FieldLegend } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ValueListInput } from '@/features/center/campaigns/value-list-input';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { JD_REQUIREMENTS_REASON_MESSAGES, POSITION_GROUP_LABELS, SKILL_LEVEL_LABELS } from '../labels';
import { useConfirmJdRequirements, useSaveJdRequirements } from './api';

type FormInput = z.input<typeof SaveJdRequirementsRequestSchema>;
type SkillGroupName = 'must_have' | 'nice_to_have';
type SkillArray = UseFieldArrayReturn<FormInput, `requirements.${SkillGroupName}`>;

const NEW_SKILL = { skill: '', level: 'BASIC', weight: 3 } as const;
const STUDY_YEARS = [1, 2, 3, 4, 5, 6] as const;
const NO_YEAR = 'none';

/** What HR starts from when the analysis failed: one empty must-have row (AC-6). */
function emptyRequirements(): JdRequirements {
  return {
    must_have: [{ ...NEW_SKILL }],
    nice_to_have: [],
    hard_conditions: { majors: [], min_study_year: null, min_gpa: null, required_languages: [] },
  };
}

function defaultsOf(view: JdRequirementsView): FormInput {
  return {
    rowVersion: view.rowVersion,
    requirements: structuredClone(view.requirements ?? emptyRequirements()),
    // Unset until chosen; the schema reports "Chọn nhóm vị trí".
    positionGroup: view.positionGroup ?? (undefined as unknown as PositionGroup),
  };
}

function saveErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.body?.code === 'JD_REQUIREMENTS_NOT_EDITABLE') {
    const reasonCode = error.body.details?.reasonCode;
    if (typeof reasonCode === 'string' && reasonCode in JD_REQUIREMENTS_REASON_MESSAGES) {
      return JD_REQUIREMENTS_REASON_MESSAGES[reasonCode]!;
    }
  }
  return apiErrorMessage(error);
}

const isConflict = (error: unknown) =>
  error instanceof ApiRequestError && error.body?.code === 'ROW_VERSION_CONFLICT';

interface RequirementsFormProps {
  jdId: number;
  view: JdRequirementsView;
  /** IN_PLACE: HR before confirmation ("Lưu nháp", "Xác nhận yêu cầu"); NEW_VERSION: approved JD. */
  mode: 'IN_PLACE' | 'NEW_VERSION';
  /** Reads the requirements again after a 409; resolves with the fresh view. */
  onReload: () => Promise<JdRequirementsView | undefined>;
  /** NEW_VERSION only: leaves the editor (after saving or on "Hủy"). */
  onDone?: () => void;
}

/**
 * Edit the normalised requirements of a JD (US-2.3 AC-7, AC-8, AC-11), validated with the schema
 * the API checks (AD-6). A stale row_version (the AI result or another person changed the
 * requirements meanwhile) shows a conflict notice; HR reloads the latest version and edits again.
 */
export function RequirementsForm({ jdId, view, mode, onReload, onDone }: RequirementsFormProps) {
  const save = useSaveJdRequirements(jdId);
  const confirm = useConfirmJdRequirements(jdId);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  // Values waiting in the confirmation dialog, with the action it runs.
  const [pending, setPending] = useState<{ values: SaveJdRequirementsRequest; action: 'confirm' | 'version' } | null>(
    null,
  );
  const [dialogError, setDialogError] = useState<string | null>(null);

  const form = useForm<FormInput, unknown, SaveJdRequirementsRequest>({
    resolver: zodResolver(SaveJdRequirementsRequestSchema),
    defaultValues: defaultsOf(view),
    mode: 'onTouched',
  });
  const mustHave = useFieldArray({ control: form.control, name: 'requirements.must_have' });
  const niceToHave = useFieldArray({ control: form.control, name: 'requirements.nice_to_have' });

  function move(from: SkillGroupName, index: number) {
    const [source, target] = from === 'must_have' ? [mustHave, niceToHave] : [niceToHave, mustHave];
    const item = form.getValues(`requirements.${from}.${index}`);
    source.remove(index);
    target.append(item);
  }

  function fail(error: unknown) {
    if (isConflict(error)) {
      setConflict(true);
      return;
    }
    setFormError(saveErrorMessage(error));
  }

  async function onSaveDraft(values: SaveJdRequirementsRequest) {
    setFormError(null);
    try {
      const saved = await save.mutateAsync(values);
      form.reset(defaultsOf(saved));
      toast.success('Đã lưu yêu cầu');
    } catch (error) {
      fail(error);
    }
  }

  async function runPending() {
    if (!pending) return;
    setDialogError(null);
    try {
      if (pending.action === 'confirm') {
        await confirm.mutateAsync(pending.values);
        toast.success('Đã xác nhận yêu cầu. JD chuyển sang chờ Trung tâm duyệt.');
      } else {
        const saved = await save.mutateAsync(pending.values);
        toast.success(`Đã lưu phiên bản yêu cầu ${saved.version}`);
        onDone?.();
      }
      setPending(null);
    } catch (error) {
      if (isConflict(error)) {
        setPending(null);
        setConflict(true);
        return;
      }
      setDialogError(saveErrorMessage(error));
    }
  }

  async function reload() {
    setReloading(true);
    try {
      const fresh = await onReload();
      if (fresh) form.reset(defaultsOf(fresh));
      setConflict(false);
      setFormError(null);
    } finally {
      setReloading(false);
    }
  }

  const busy = save.isPending || confirm.isPending;
  const mustHaveError = form.formState.errors.requirements?.must_have;
  const listError = mustHaveError?.root?.message ?? mustHaveError?.message;

  return (
    <form
      noValidate
      onSubmit={(event) => void form.handleSubmit(onSaveDraft)(event)}
      className="flex flex-col gap-6"
      aria-label="Yêu cầu chuẩn hóa"
    >
      {conflict && (
        <Alert variant="destructive">
          <RefreshCw />
          <AlertTitle>Yêu cầu vừa được cập nhật ở nơi khác</AlertTitle>
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
      {formError && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Chưa lưu được yêu cầu</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <FieldGroup>
        <Controller
          name="positionGroup"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="req-position-group">Nhóm vị trí</FieldLabel>
              <Select value={field.value ?? ''} onValueChange={field.onChange}>
                <SelectTrigger id="req-position-group" className="w-full" aria-invalid={fieldState.invalid} onBlur={field.onBlur}>
                  <SelectValue placeholder="Chọn nhóm vị trí" />
                </SelectTrigger>
                <SelectContent>
                  {POSITION_GROUPS.map((group) => (
                    <SelectItem key={group} value={group}>
                      {POSITION_GROUP_LABELS[group]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>

      <SkillGroup
        form={form}
        array={mustHave}
        group="must_have"
        title="Kỹ năng bắt buộc"
        description="Sinh viên cần có để làm được việc. Trọng số so sánh các kỹ năng trong cùng nhóm."
        moveLabel="Chuyển sang nhóm bổ trợ"
        listError={listError}
        onMove={move}
      />
      <SkillGroup
        form={form}
        array={niceToHave}
        group="nice_to_have"
        title="Kỹ năng bổ trợ"
        description="Có thì tốt hơn, không có vẫn được xét."
        moveLabel="Chuyển sang nhóm bắt buộc"
        onMove={move}
      />

      <FieldSet>
        <FieldLegend>Điều kiện cứng</FieldLegend>
        <FieldDescription>Sinh viên không đáp ứng sẽ không được xét cho JD này. Để trống nếu JD không yêu cầu.</FieldDescription>
        <FieldGroup>
          <Controller
            name="requirements.hard_conditions.majors"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="req-majors">Ngành</FieldLabel>
                <ValueListInput
                  id="req-majors"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={fieldState.invalid}
                  placeholder="Công nghệ thông tin"
                  itemName="ngành"
                />
                <FieldDescription>Để trống nếu JD nhận mọi ngành.</FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Controller
              name="requirements.hard_conditions.min_study_year"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="req-study-year">Năm học tối thiểu</FieldLabel>
                  <Select
                    value={field.value === null ? NO_YEAR : String(field.value)}
                    onValueChange={(next) => field.onChange(next === NO_YEAR ? null : Number(next))}
                  >
                    <SelectTrigger id="req-study-year" className="w-full" aria-invalid={fieldState.invalid} onBlur={field.onBlur}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_YEAR}>Không yêu cầu</SelectItem>
                      {STUDY_YEARS.map((year) => (
                        <SelectItem key={year} value={String(year)}>
                          Từ năm {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="requirements.hard_conditions.min_gpa"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="req-gpa">GPA tối thiểu (thang 4)</FieldLabel>
                  <Input
                    id="req-gpa"
                    name={field.name}
                    ref={field.ref}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={4}
                    step={0.1}
                    placeholder="Không yêu cầu"
                    value={field.value === null || Number.isNaN(field.value) ? '' : field.value}
                    onChange={(event) => field.onChange(event.target.value === '' ? null : event.target.valueAsNumber)}
                    onBlur={field.onBlur}
                    aria-invalid={fieldState.invalid}
                    className="tabular-nums"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </div>
          <Controller
            name="requirements.hard_conditions.required_languages"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="req-languages">Ngoại ngữ bắt buộc</FieldLabel>
                <ValueListInput
                  id="req-languages"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={fieldState.invalid}
                  placeholder="Tiếng Anh (TOEIC 550)"
                  itemName="ngoại ngữ"
                />
                <FieldDescription>Ghi kèm mức yêu cầu nếu có. Ngoại ngữ chỉ ưu tiên thì thêm vào kỹ năng bổ trợ.</FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </FieldGroup>
      </FieldSet>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {mode === 'IN_PLACE' ? (
          <>
            <Button type="submit" variant="outline" disabled={busy}>
              {save.isPending && <Spinner data-icon="inline-start" />}
              Lưu nháp
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void form.handleSubmit((values) => setPending({ values, action: 'confirm' }))()}
            >
              Xác nhận yêu cầu
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="outline" disabled={busy} onClick={onDone}>
              Hủy
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void form.handleSubmit((values) => setPending({ values, action: 'version' }))()}
            >
              Lưu phiên bản mới
            </Button>
          </>
        )}
      </div>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (busy || open) return;
          setPending(null);
          setDialogError(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.action === 'confirm' ? 'Xác nhận yêu cầu chuẩn hóa?' : 'Tạo phiên bản yêu cầu mới?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.action === 'confirm'
                ? 'JD chuyển sang chờ Trung tâm duyệt. Từ lúc đó đến khi JD được duyệt, yêu cầu không sửa được nữa.'
                : `JD đang dùng phiên bản ${view.version}. Lưu sẽ tạo phiên bản ${view.version + 1}, có hiệu lực ngay; hồ sơ đã chấm theo JD này sẽ được chấm lại theo phiên bản mới.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dialogError && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Chưa lưu được yêu cầu</AlertTitle>
              <AlertDescription>{dialogError}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Hủy</AlertDialogCancel>
            <Button onClick={() => void runPending()} disabled={busy}>
              {busy && <Spinner data-icon="inline-start" />}
              {pending?.action === 'confirm' ? 'Xác nhận yêu cầu' : 'Lưu phiên bản mới'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

interface SkillGroupProps {
  form: UseFormReturn<FormInput, unknown, SaveJdRequirementsRequest>;
  array: SkillArray;
  group: SkillGroupName;
  title: string;
  description: string;
  moveLabel: string;
  listError?: string;
  onMove: (group: SkillGroupName, index: number) => void;
}

/** One skill group as an editable table: skill, level, weight, move to the other group, remove. */
function SkillGroup({ form, array, group, title, description, moveLabel, listError, onMove }: SkillGroupProps) {
  return (
    <FieldSet>
      <FieldLegend>{title}</FieldLegend>
      <FieldDescription>{description}</FieldDescription>
      {array.fields.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-40">Kỹ năng</TableHead>
              <TableHead className="min-w-32">Mức độ</TableHead>
              <TableHead className="w-24">Trọng số</TableHead>
              <TableHead className="w-24">
                <span className="sr-only">Thao tác</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {array.fields.map((row, index) => {
              const position = `${title.toLowerCase()} ${index + 1}`;
              return (
                <TableRow key={row.id} className="align-top">
                  <TableCell className="whitespace-normal">
                    <Controller
                      name={`requirements.${group}.${index}.skill`}
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <Input {...field} aria-label={`Tên ${position}`} aria-invalid={fieldState.invalid} />
                          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                        </Field>
                      )}
                    />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <Controller
                      name={`requirements.${group}.${index}.level`}
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger
                              className="w-full"
                              aria-label={`Mức độ của ${position}`}
                              aria-invalid={fieldState.invalid}
                              onBlur={field.onBlur}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SKILL_LEVELS.map((level) => (
                                <SelectItem key={level} value={level}>
                                  {SKILL_LEVEL_LABELS[level]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                        </Field>
                      )}
                    />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <Controller
                      name={`requirements.${group}.${index}.weight`}
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <Input
                            name={field.name}
                            ref={field.ref}
                            type="number"
                            inputMode="decimal"
                            min={0.5}
                            max={SKILL_WEIGHT_MAX}
                            step={0.5}
                            value={Number.isNaN(field.value) ? '' : field.value}
                            onChange={(event) =>
                              field.onChange(event.target.value === '' ? Number.NaN : event.target.valueAsNumber)
                            }
                            onBlur={field.onBlur}
                            aria-label={`Trọng số của ${position}`}
                            aria-invalid={fieldState.invalid}
                            className="tabular-nums"
                          />
                          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                        </Field>
                      )}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`${moveLabel}: ${position}`}
                        title={moveLabel}
                        onClick={() => onMove(group, index)}
                      >
                        <ArrowDownUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Xóa ${position}`}
                        title="Xóa kỹ năng"
                        onClick={() => array.remove(index)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {listError && <FieldError>{listError}</FieldError>}
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => array.append({ ...NEW_SKILL })}>
        <Plus data-icon="inline-start" />
        Thêm kỹ năng
      </Button>
    </FieldSet>
  );
}
