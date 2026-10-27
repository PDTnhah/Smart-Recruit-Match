import { zodResolver } from '@hookform/resolvers/zod';
import { type CvProfile, CvProfileFormSchema, type CvProfileFormValues, type CvProfileView } from '@srm/shared';
import { CircleAlert, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Controller, type FieldPath, type FieldError as FormFieldError, useFieldArray, useForm, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { ValueListInput } from '@/features/center/campaigns/value-list-input';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { applyNestedServerErrors } from '@/shared/forms/server-errors';
import { useConfirmCvProfile, useSaveCvProfile } from './api';
import { ConfirmActionDialog } from './confirm-action-dialog';
import { SkillInput } from './skill-input';

type Form = UseFormReturn<CvProfileFormValues, unknown, CvProfile>;
type Path = FieldPath<CvProfileFormValues>;

const NEW_ITEMS = {
  education: { institution: '', degree: null, major: null, start: null, end: null, gpa: null },
  skills: { name: '', canonical_name: null, match: 'NEW' },
  projects: { name: '', role: null, description: null, technologies: [], start: null, end: null },
  experience: { organization: '', position: null, description: null, start: null, end: null },
  languages: { language: '', level: null },
  certificates: { name: '', issuer: null, year: null },
} as const;

/** Answers after which the form no longer matches the CV: the screen offers to load it again. */
const STALE_CODES = new Set(['ROW_VERSION_CONFLICT', 'CV_PROFILE_NOT_EDITABLE', 'CAMPAIGN_PHASE_MISMATCH']);

interface Stale {
  title: string;
  description: string;
}

function staleOf(error: unknown): Stale | null {
  if (!(error instanceof ApiRequestError) || !error.body || !STALE_CODES.has(error.body.code)) return null;
  return error.body.code === 'ROW_VERSION_CONFLICT'
    ? {
        title: 'Hồ sơ vừa được cập nhật ở nơi khác',
        description: 'Thay đổi trên màn này chưa được lưu. Tải bản mới nhất để xem, rồi sửa lại nếu cần.',
      }
    : { title: 'Hồ sơ không sửa được nữa', description: apiErrorMessage(error) };
}

const inputId = (name: string) => `cv-profile-${name.replaceAll('.', '-')}`;

/** The message of a list as a whole ("Tối đa 10 ngoại ngữ"), wherever React Hook Form put it. */
function listError(error: unknown): string | undefined {
  const list = error as { message?: string; root?: FormFieldError } | undefined;
  return list?.root?.message ?? list?.message;
}

interface TextFieldProps {
  form: Form;
  name: Path;
  label: string;
  placeholder?: string;
  description?: string;
  multiline?: boolean;
}

/** A text of the profile; left blank, an optional one is stored as none (CvProfileFormSchema). */
function TextField({ form, name, label, placeholder, description, multiline }: TextFieldProps) {
  return (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => {
        const props = {
          id: inputId(name),
          name: field.name,
          ref: field.ref,
          value: (field.value as string | null) ?? '',
          onChange: field.onChange,
          onBlur: field.onBlur,
          placeholder,
          'aria-invalid': fieldState.invalid,
        };
        return (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={props.id}>{label}</FieldLabel>
            {multiline ? <Textarea {...props} rows={4} /> : <Input {...props} />}
            {description && <FieldDescription>{description}</FieldDescription>}
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        );
      }}
    />
  );
}

/** Start and end of a period, side by side from `sm`. */
function PeriodFields({ form, prefix }: { form: Form; prefix: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField form={form} name={`${prefix}.start` as Path} label="Từ" placeholder="09/2022" />
      <TextField form={form} name={`${prefix}.end` as Path} label="Đến" placeholder="06/2026 hoặc hiện tại" />
    </div>
  );
}

interface ItemSectionProps {
  title: string;
  description?: string;
  /** Names one entry: "Học vấn" → "Học vấn 2", "Xóa học vấn 2". */
  itemLabel: string;
  addLabel: string;
  ids: string[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  error?: string;
  children: (index: number) => ReactNode;
}

/** One section of the profile: its entries, each removable, and a button adding one (AC-2). */
function ItemSection({ title, description, itemLabel, addLabel, ids, onAdd, onRemove, error, children }: ItemSectionProps) {
  return (
    <FieldSet>
      <FieldLegend>{title}</FieldLegend>
      {description && <FieldDescription>{description}</FieldDescription>}
      {ids.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có mục nào.</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {ids.map((id, index) => (
            <li key={id} className="flex min-w-0 flex-col gap-4">
              {index > 0 && <Separator />}
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {itemLabel} {index + 1}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(index)}>
                  <Trash2 data-icon="inline-start" />
                  Xóa<span className="sr-only">{` ${itemLabel.toLowerCase()} ${index + 1}`}</span>
                </Button>
              </div>
              <FieldGroup>{children(index)}</FieldGroup>
            </li>
          ))}
        </ol>
      )}
      {error && <FieldError>{error}</FieldError>}
      <div>
        <Button type="button" variant="outline" onClick={onAdd}>
          <Plus data-icon="inline-start" />
          {addLabel}
        </Button>
      </div>
    </FieldSet>
  );
}

function SkillsSection({ form }: { form: Form }) {
  const skills = useFieldArray({ control: form.control, name: 'skills' });
  return (
    <FieldSet>
      <FieldLegend>Kỹ năng</FieldLegend>
      <FieldDescription>Chọn tên gợi ý từ danh mục nếu có. Kỹ năng chưa có trong danh mục vẫn thêm được.</FieldDescription>
      {skills.fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có kỹ năng nào.</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {skills.fields.map((item, index) => (
            <li key={item.id} className="flex min-w-0 items-start gap-2">
              <Controller
                name={`skills.${index}`}
                control={form.control}
                render={({ field, fieldState }) => {
                  const error = fieldState.error as { name?: FormFieldError } | undefined;
                  return (
                    <Field data-invalid={fieldState.invalid} className="min-w-0 flex-1">
                      <FieldLabel htmlFor={inputId(`skills.${index}`)} className="sr-only">
                        Kỹ năng {index + 1}
                      </FieldLabel>
                      <SkillInput
                        id={inputId(`skills.${index}`)}
                        value={{ ...field.value, name: field.value.name ?? '' }}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && <FieldError errors={[error?.name ?? fieldState.error]} />}
                    </Field>
                  );
                }}
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => skills.remove(index)}>
                <Trash2 />
                <span className="sr-only">Xóa kỹ năng {index + 1}</span>
              </Button>
            </li>
          ))}
        </ol>
      )}
      {listError(form.formState.errors.skills) && <FieldError>{listError(form.formState.errors.skills)}</FieldError>}
      <div>
        <Button type="button" variant="outline" onClick={() => skills.append({ ...NEW_ITEMS.skills })}>
          <Plus data-icon="inline-start" />
          Thêm kỹ năng
        </Button>
      </div>
    </FieldSet>
  );
}

function Sections({ form }: { form: Form }) {
  const errors = form.formState.errors;
  const education = useFieldArray({ control: form.control, name: 'education' });
  const projects = useFieldArray({ control: form.control, name: 'projects' });
  const experience = useFieldArray({ control: form.control, name: 'experience' });
  const languages = useFieldArray({ control: form.control, name: 'languages' });
  const certificates = useFieldArray({ control: form.control, name: 'certificates' });

  return (
    <>
      <FieldGroup>
        <TextField
          form={form}
          name="summary"
          label="Giới thiệu, mục tiêu nghề nghiệp"
          description="Không cần ghi thông tin cá nhân; nếu có, hệ thống vẫn che trước khi chấm."
          multiline
        />
      </FieldGroup>

      <ItemSection
        title="Học vấn"
        itemLabel="Học vấn"
        addLabel="Thêm học vấn"
        ids={education.fields.map((item) => item.id)}
        onAdd={() => education.append({ ...NEW_ITEMS.education })}
        onRemove={education.remove}
        error={listError(errors.education)}
      >
        {(index) => (
          <>
            <TextField form={form} name={`education.${index}.institution`} label="Tên trường" />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField form={form} name={`education.${index}.degree`} label="Bậc học" placeholder="Kỹ sư, Cử nhân" />
              <TextField form={form} name={`education.${index}.major`} label="Ngành học" />
            </div>
            <PeriodFields form={form} prefix={`education.${index}`} />
            <TextField form={form} name={`education.${index}.gpa`} label="GPA" placeholder="3.2/4" />
          </>
        )}
      </ItemSection>

      <SkillsSection form={form} />

      <ItemSection
        title="Dự án"
        itemLabel="Dự án"
        addLabel="Thêm dự án"
        ids={projects.fields.map((item) => item.id)}
        onAdd={() => projects.append({ ...NEW_ITEMS.projects, technologies: [] })}
        onRemove={projects.remove}
        error={listError(errors.projects)}
      >
        {(index) => (
          <>
            <TextField form={form} name={`projects.${index}.name`} label="Tên dự án" />
            <TextField form={form} name={`projects.${index}.role`} label="Vai trò" placeholder="Backend, trưởng nhóm" />
            <TextField form={form} name={`projects.${index}.description`} label="Mô tả" multiline />
            <Controller
              name={`projects.${index}.technologies`}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={inputId(`projects.${index}.technologies`)}>Công nghệ</FieldLabel>
                  <ValueListInput
                    id={inputId(`projects.${index}.technologies`)}
                    value={field.value.map((item) => item ?? '')}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={fieldState.invalid}
                    placeholder="Java, PostgreSQL"
                    itemName="công nghệ"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <PeriodFields form={form} prefix={`projects.${index}`} />
          </>
        )}
      </ItemSection>

      <ItemSection
        title="Kinh nghiệm làm việc"
        itemLabel="Kinh nghiệm"
        addLabel="Thêm kinh nghiệm"
        ids={experience.fields.map((item) => item.id)}
        onAdd={() => experience.append({ ...NEW_ITEMS.experience })}
        onRemove={experience.remove}
        error={listError(errors.experience)}
      >
        {(index) => (
          <>
            <TextField form={form} name={`experience.${index}.organization`} label="Công ty, tổ chức" />
            <TextField form={form} name={`experience.${index}.position`} label="Vị trí" />
            <TextField form={form} name={`experience.${index}.description`} label="Công việc đã làm" multiline />
            <PeriodFields form={form} prefix={`experience.${index}`} />
          </>
        )}
      </ItemSection>

      <ItemSection
        title="Ngoại ngữ"
        itemLabel="Ngoại ngữ"
        addLabel="Thêm ngoại ngữ"
        ids={languages.fields.map((item) => item.id)}
        onAdd={() => languages.append({ ...NEW_ITEMS.languages })}
        onRemove={languages.remove}
        error={listError(errors.languages)}
      >
        {(index) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField form={form} name={`languages.${index}.language`} label="Ngoại ngữ" placeholder="Tiếng Anh" />
            <TextField form={form} name={`languages.${index}.level`} label="Trình độ" placeholder="TOEIC 650" />
          </div>
        )}
      </ItemSection>

      <ItemSection
        title="Chứng chỉ, giải thưởng"
        itemLabel="Chứng chỉ"
        addLabel="Thêm chứng chỉ"
        ids={certificates.fields.map((item) => item.id)}
        onAdd={() => certificates.append({ ...NEW_ITEMS.certificates })}
        onRemove={certificates.remove}
        error={listError(errors.certificates)}
      >
        {(index) => (
          <>
            <TextField form={form} name={`certificates.${index}.name`} label="Tên chứng chỉ, giải thưởng" />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField form={form} name={`certificates.${index}.issuer`} label="Đơn vị cấp" />
              <TextField form={form} name={`certificates.${index}.year`} label="Năm" />
            </div>
          </>
        )}
      </ItemSection>
    </>
  );
}

interface ProfileFormProps {
  view: CvProfileView & { profile: CvProfile };
  /** Reads the profile again after a 409; resolves with the fresh view. */
  onReload: () => Promise<CvProfileView | undefined>;
}

/**
 * Edit the profile read from the CV (US-2.6 AC-2 to AC-6), validated with the schema the API
 * checks (AD-6). "Lưu nháp" keeps the CV awaiting confirmation; "Xác nhận hồ sơ" asks first, as
 * the confirmed profile is what matching scores. A stale row_version (another tab saved, or a new
 * version was analysed), a confirmation elsewhere or the end of intake shows a notice, and the
 * latest state is loaded on request.
 */
export function ProfileForm({ view, onReload }: ProfileFormProps) {
  const save = useSaveCvProfile();
  const confirm = useConfirmCvProfile();
  const [formError, setFormError] = useState<string | null>(null);
  const [stale, setStale] = useState<Stale | null>(null);
  const [reloading, setReloading] = useState(false);
  const [pending, setPending] = useState<CvProfile | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  // The row_version the values were loaded with, not the latest read: a refetch (SSE, another
  // tab) must not let a save of older values through (AC-6).
  const [rowVersion, setRowVersion] = useState(view.rowVersion);

  const form = useForm<CvProfileFormValues, unknown, CvProfile>({
    resolver: zodResolver(CvProfileFormSchema),
    defaultValues: structuredClone(view.profile),
    mode: 'onTouched',
  });

  /** Shows what the answer calls for; returns the message left for the caller to show, if any. */
  function failed(error: unknown): string | null {
    const notice = staleOf(error);
    if (notice) setStale(notice);
    else if (!applyNestedServerErrors(error, form.setError, 'profile')) return apiErrorMessage(error);
    return null;
  }

  async function onSaveDraft(profile: CvProfile) {
    setFormError(null);
    try {
      const saved = await save.mutateAsync({ cvId: view.cvId, rowVersion, profile });
      setRowVersion(saved.rowVersion);
      if (saved.profile) form.reset(structuredClone(saved.profile));
      toast.success('Đã lưu nháp hồ sơ');
    } catch (error) {
      setFormError(failed(error));
    }
  }

  async function onConfirm() {
    if (!pending) return;
    setDialogError(null);
    try {
      await confirm.mutateAsync({ cvId: view.cvId, rowVersion, profile: pending });
      setPending(null);
      toast.success('Đã xác nhận hồ sơ năng lực');
    } catch (error) {
      const message = failed(error);
      // Handled on the form (notice or field errors): close the dialog so it shows.
      if (message === null) setPending(null);
      else setDialogError(message);
    }
  }

  async function reload() {
    setReloading(true);
    try {
      const fresh = await onReload();
      if (fresh) setRowVersion(fresh.rowVersion);
      if (fresh?.profile) form.reset(structuredClone(fresh.profile));
      setStale(null);
      setFormError(null);
    } finally {
      setReloading(false);
    }
  }

  const busy = save.isPending || confirm.isPending;

  return (
    <form
      noValidate
      onSubmit={(event) => void form.handleSubmit(onSaveDraft)(event)}
      className="flex min-w-0 flex-col gap-6"
      aria-label="Hồ sơ năng lực"
    >
      {stale && (
        <Alert variant="destructive">
          <RefreshCw />
          <AlertTitle>{stale.title}</AlertTitle>
          <AlertDescription>{stale.description}</AlertDescription>
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
          <AlertTitle>Chưa lưu được hồ sơ</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Sections form={form} />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="submit" variant="outline" disabled={busy}>
          {save.isPending && <Spinner data-icon="inline-start" />}
          Lưu nháp
        </Button>
        <Button type="button" disabled={busy} onClick={() => void form.handleSubmit((profile) => setPending(profile))()}>
          Xác nhận hồ sơ
        </Button>
      </div>

      <ConfirmActionDialog
        open={pending !== null}
        onClose={() => {
          setPending(null);
          setDialogError(null);
        }}
        title="Xác nhận hồ sơ năng lực?"
        description="Hồ sơ đã xác nhận được dùng để đánh giá độ phù hợp với các JD. Trước hạn nộp CV vẫn sửa lại được, khi đó cần xác nhận lần nữa."
        actionLabel="Xác nhận hồ sơ"
        onConfirm={() => void onConfirm()}
        pending={confirm.isPending}
        error={dialogError}
        errorTitle="Chưa xác nhận được hồ sơ"
      />
    </form>
  );
}
