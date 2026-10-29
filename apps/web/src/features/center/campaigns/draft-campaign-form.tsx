import { zodResolver } from '@hookform/resolvers/zod';
import {
  CAMPAIGN_DEADLINE_KEYS,
  type Campaign,
  type CreateCampaignRequest,
  CreateCampaignRequestSchema,
  DEFAULT_CAMPAIGN_CONFIG,
} from '@srm/shared';
import { CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { apiErrorMessage } from '@/shared/api/errors';
import { applyServerFieldErrors } from '@/shared/forms/server-errors';
import { useCreateCampaign, useUpdateCampaign } from './api';
import { DeadlineField } from './deadline-field';
import { DEADLINE_LABELS, PARAMETER_FIELDS, SCV_WEIGHT_FIELDS } from './labels';
import { ParameterInputs } from './parameter-fields';
import { CAMPAIGNS_PATH, campaignPath } from './paths';
import { ValueListInput } from './value-list-input';

type FormInput = z.input<typeof CreateCampaignRequestSchema>;

/** Form field names, which are also the paths of the API's 400 issues. */
const FIELDS = [
  'name',
  'target.cohorts',
  'target.majors',
  ...CAMPAIGN_DEADLINE_KEYS.map((key) => `phaseDeadlines.${key}`),
  ...[...PARAMETER_FIELDS, ...SCV_WEIGHT_FIELDS].map((parameter) => `config.${parameter.key}`),
];

function defaultsOf(campaign: Campaign | undefined): FormInput {
  return {
    name: campaign?.name ?? '',
    target: { cohorts: [...(campaign?.target.cohorts ?? [])], majors: [...(campaign?.target.majors ?? [])] },
    // null rather than missing, so an update clears a deadline the user removed.
    phaseDeadlines: {
      intake_end: campaign?.phaseDeadlines.intake_end ?? null,
      preference_end: campaign?.phaseDeadlines.preference_end ?? null,
      testing_end: campaign?.phaseDeadlines.testing_end ?? null,
    },
    config: { ...(campaign?.config ?? DEFAULT_CAMPAIGN_CONFIG) },
  };
}

/**
 * Create a campaign, or edit a draft (US-1.4 AC-1, AC-2, AC-4, AC-9): three sections validated
 * with the shared CreateCampaignRequestSchema, the schema the API checks POST with. Parameters
 * start at the PRD defaults.
 */
export function DraftCampaignForm({ campaign }: { campaign?: Campaign }) {
  const navigate = useNavigate();
  const create = useCreateCampaign();
  const update = useUpdateCampaign(campaign?.id ?? 0);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<FormInput, unknown, CreateCampaignRequest>({
    resolver: zodResolver(CreateCampaignRequestSchema),
    defaultValues: defaultsOf(campaign),
    mode: 'onTouched',
  });

  async function onSubmit(values: CreateCampaignRequest) {
    setFormError(null);
    try {
      if (campaign) {
        await update.mutateAsync({ rowVersion: campaign.rowVersion, ...values });
        toast.success('Đã lưu thay đổi');
      } else {
        const created = await create.mutateAsync(values);
        toast.success('Đã tạo đợt thực tập');
        void navigate(campaignPath(created.id), { replace: true });
      }
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
          <AlertTitle>{campaign ? 'Chưa lưu được thay đổi' : 'Chưa tạo được đợt'}</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Đối tượng</CardTitle>
          <CardDescription>
            Chỉ sinh viên có khóa và ngành nằm trong hai danh sách dưới đây mới thấy đợt và nộp CV được.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="campaign-name">Tên đợt</FieldLabel>
                  <Input
                    {...field}
                    id="campaign-name"
                    autoFocus={!campaign}
                    placeholder="Đợt thực tập HK1 2026–2027"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="target.cohorts"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="campaign-cohorts">Khóa</FieldLabel>
                  <ValueListInput
                    id="campaign-cohorts"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={fieldState.invalid}
                    placeholder="K66"
                    itemName="khóa"
                  />
                  <FieldDescription>Nhập từng khóa rồi nhấn Enter.</FieldDescription>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="target.majors"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="campaign-majors">Ngành</FieldLabel>
                  <ValueListInput
                    id="campaign-majors"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={fieldState.invalid}
                    placeholder="Công nghệ thông tin"
                    itemName="ngành"
                  />
                  <FieldDescription>Ghi đúng tên ngành như trong hồ sơ sinh viên.</FieldDescription>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mốc thời gian</CardTitle>
          <CardDescription>
            Đến mỗi mốc, đợt tự chuyển sang giai đoạn kế tiếp. Có thể lưu nháp khi chưa đủ mốc; mở đợt cần đủ ba
            mốc và mọi mốc phải ở tương lai.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {CAMPAIGN_DEADLINE_KEYS.map((key) => (
              <Controller
                key={key}
                name={`phaseDeadlines.${key}`}
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`deadline-${key}`}>{DEADLINE_LABELS[key].label}</FieldLabel>
                    <DeadlineField
                      id={`deadline-${key}`}
                      label={DEADLINE_LABELS[key].label}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      invalid={fieldState.invalid}
                      clearable
                    />
                    <FieldDescription>{DEADLINE_LABELS[key].description}</FieldDescription>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            ))}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tham số</CardTitle>
          <CardDescription>
            Các ô đã điền sẵn giá trị mặc định của hệ thống. Sau khi mở đợt, tham số bị khóa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ParameterInputs control={form.control} />
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" asChild>
          <Link to={CAMPAIGNS_PATH}>Hủy</Link>
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Spinner data-icon="inline-start" />}
          {campaign ? (submitting ? 'Đang lưu' : 'Lưu thay đổi') : submitting ? 'Đang tạo đợt' : 'Tạo đợt'}
        </Button>
      </div>
    </form>
  );
}
