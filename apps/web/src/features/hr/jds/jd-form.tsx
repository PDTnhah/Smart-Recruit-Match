import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateJdRequest,
  CreateJdRequestSchema,
  type JobDescription,
  WORK_MODES,
  type WorkMode,
} from '@srm/shared';
import { CircleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useCampaigns } from '@/features/center/campaigns/api';
import { useCreateJd, useUpdateJd, useUploadJdFile } from '@/features/jds/api';
import { WORK_MODE_LABELS } from '@/features/jds/labels';
import { apiErrorMessage } from '@/shared/api/errors';
import { applyServerFieldErrors } from '@/shared/forms/server-errors';
import { JdFilePicker } from './file-picker';
import { hrJdPath } from './paths';

type FormInput = z.input<typeof CreateJdRequestSchema>;

/** Field names, also the paths of the API's 400 issues. */
const FIELDS = ['campaignId', 'title', 'quota', 'location', 'workMode', 'internshipPeriod', 'allowance', 'description'];

function defaultsOf(jd: JobDescription | undefined): FormInput {
  return {
    // Unset until HR picks a campaign; the schema reports "Chọn đợt thực tập".
    campaignId: jd?.campaignId ?? (undefined as unknown as number),
    title: jd?.title ?? '',
    quota: jd?.quota ?? 1,
    location: jd?.location ?? '',
    workMode: jd?.workMode ?? (undefined as unknown as WorkMode),
    internshipPeriod: jd?.internshipPeriod ?? '',
    allowance: jd?.allowance ?? '',
    description: jd?.description ?? '',
  };
}

/** Campaigns HR can post to: those taking JDs and CVs right now (INTAKE). */
function CampaignSelect({
  id,
  value,
  onChange,
  onBlur,
  invalid,
}: {
  id: string;
  value: number | undefined;
  onChange: (value: number) => void;
  onBlur: () => void;
  invalid: boolean;
}) {
  const campaigns = useCampaigns();
  const open = (campaigns.data ?? []).filter((campaign) => campaign.status === 'INTAKE');
  if (campaigns.isSuccess && open.length === 0) {
    return (
      <Alert>
        <CircleAlert />
        <AlertTitle>Chưa có đợt nào đang nhận JD</AlertTitle>
        <AlertDescription>JD chỉ đăng được khi Trung tâm đã mở đợt thực tập. Quay lại khi đợt mới mở.</AlertDescription>
      </Alert>
    );
  }
  return (
    <Select
      value={value === undefined || Number.isNaN(value) ? '' : String(value)}
      onValueChange={(next) => onChange(Number(next))}
      disabled={campaigns.isPending}
    >
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid} onBlur={onBlur}>
        <SelectValue placeholder={campaigns.isPending ? 'Đang tải danh sách đợt' : 'Chọn đợt thực tập'} />
      </SelectTrigger>
      <SelectContent>
        {open.map((campaign) => (
          <SelectItem key={campaign.id} value={String(campaign.id)}>
            {campaign.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Post a JD, or edit a draft (US-1.5 AC-4, AC-6, AC-10), validated with the shared schema the API
 * checks. A new JD may come with its original file: the JD is created first, then the file is
 * uploaded (`PUT /api/jds/{id}/file`). The campaign cannot change after creation.
 *
 * Editing keeps unsaved input when the JD's row_version moves for another reason (a file upload):
 * the next save sends the current row_version. `onDirtyChange` lets the page warn before submit.
 */
export function JdForm({ jd, onDirtyChange }: { jd?: JobDescription; onDirtyChange?: (dirty: boolean) => void }) {
  const navigate = useNavigate();
  const create = useCreateJd();
  const update = useUpdateJd(jd?.id ?? 0);
  const upload = useUploadJdFile();
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<FormInput, unknown, CreateJdRequest>({
    resolver: zodResolver(CreateJdRequestSchema),
    defaultValues: defaultsOf(jd),
    mode: 'onTouched',
  });

  const dirty = form.formState.isDirty;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  async function onSubmit(values: CreateJdRequest) {
    setFormError(null);
    try {
      if (jd) {
        // The campaign is fixed once the JD exists; the patch carries only the JD fields.
        const saved = await update.mutateAsync({
          rowVersion: jd.rowVersion,
          title: values.title,
          quota: values.quota,
          location: values.location,
          workMode: values.workMode,
          internshipPeriod: values.internshipPeriod,
          allowance: values.allowance,
          description: values.description,
        });
        form.reset(defaultsOf(saved));
        toast.success('Đã lưu JD');
        return;
      }
      const created = await create.mutateAsync(values);
      if (file) {
        try {
          await upload.mutateAsync({ file, rowVersion: created.rowVersion, jdId: created.id });
        } catch (error) {
          toast.error(`Đã lưu JD nhưng chưa tải được file: ${apiErrorMessage(error)}`);
          void navigate(hrJdPath(created.id), { replace: true });
          return;
        }
      }
      toast.success('Đã lưu JD nháp. Kiểm tra lại rồi bấm "Nộp JD".');
      void navigate(hrJdPath(created.id), { replace: true });
    } catch (error) {
      applyServerFieldErrors(error, form.setError, FIELDS);
      setFormError(apiErrorMessage(error));
    }
  }

  const submitting = form.formState.isSubmitting;

  return (
    <form noValidate onSubmit={(event) => void form.handleSubmit(onSubmit)(event)} className="flex flex-col gap-6">
      {formError && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{jd ? 'Chưa lưu được JD' : 'Chưa đăng được JD'}</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Thông tin vị trí</CardTitle>
          <CardDescription>Các mục này giúp sinh viên và Trung tâm hiểu vị trí thực tập.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {!jd && (
              <Controller
                name="campaignId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="jd-campaign">Đợt thực tập</FieldLabel>
                    <CampaignSelect
                      id="jd-campaign"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            )}
            <Controller
              name="title"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="jd-title">Vị trí</FieldLabel>
                  <Input
                    {...field}
                    id="jd-title"
                    placeholder="Thực tập sinh Backend"
                    autoFocus={!jd}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Controller
                name="quota"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="jd-quota">Chỉ tiêu</FieldLabel>
                    <Input
                      id="jd-quota"
                      name={field.name}
                      ref={field.ref}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      // An emptied input becomes NaN, which the shared schema reports as "phải là một số".
                      value={Number.isNaN(field.value) ? '' : field.value}
                      onChange={(event) =>
                        field.onChange(event.target.value === '' ? Number.NaN : event.target.valueAsNumber)
                      }
                      onBlur={field.onBlur}
                      aria-invalid={fieldState.invalid}
                      className="tabular-nums"
                    />
                    <FieldDescription>Số sinh viên doanh nghiệp nhận cho vị trí này.</FieldDescription>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="workMode"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="jd-work-mode">Hình thức làm việc</FieldLabel>
                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="jd-work-mode"
                        className="w-full"
                        aria-invalid={fieldState.invalid}
                        onBlur={field.onBlur}
                      >
                        <SelectValue placeholder="Chọn hình thức" />
                      </SelectTrigger>
                      <SelectContent>
                        {WORK_MODES.map((mode) => (
                          <SelectItem key={mode} value={mode}>
                            {WORK_MODE_LABELS[mode]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>
            <Controller
              name="location"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="jd-location">Địa điểm</FieldLabel>
                  <Input {...field} id="jd-location" placeholder="Cầu Giấy, Hà Nội" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Controller
                name="internshipPeriod"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="jd-period">Thời gian thực tập</FieldLabel>
                    <Input
                      {...field}
                      id="jd-period"
                      placeholder="01/2027 – 04/2027"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="allowance"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="jd-allowance">Phụ cấp (không bắt buộc)</FieldLabel>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      id="jd-allowance"
                      placeholder="3 triệu đồng/tháng"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Nội dung JD</CardTitle>
          <CardDescription>
            Nhập mô tả công việc, tải file JD gốc, hoặc cả hai. JD cần ít nhất một trong hai thì mới nộp được.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="jd-description">Mô tả công việc</FieldLabel>
                  <Textarea
                    {...field}
                    value={field.value ?? ''}
                    id="jd-description"
                    rows={8}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            {!jd && <JdFilePicker id="jd-file" onChange={setFile} disabled={submitting} />}
          </FieldGroup>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
          {submitting && <Spinner data-icon="inline-start" />}
          {submitting ? 'Đang lưu' : jd ? 'Lưu thay đổi' : 'Lưu JD nháp'}
        </Button>
      </div>
    </form>
  );
}
