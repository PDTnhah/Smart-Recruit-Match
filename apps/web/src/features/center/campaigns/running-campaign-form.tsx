import { zodResolver } from '@hookform/resolvers/zod';
import {
  CAMPAIGN_DEADLINE_KEYS,
  type Campaign,
  type CampaignConfig,
  type CampaignDeadlineKey,
  type CampaignStatus,
  actualCampaignPhase,
  DEADLINE_MIN_NOTICE_HOURS,
  DEADLINE_TOO_SOON,
  earliestDeadlineMove,
  isCampaignFinal,
  type UpdateCampaignRequest,
  UpdateRunningCampaignRequestSchema,
} from '@srm/shared';
import { CircleAlert, Info } from 'lucide-react';
import { useState } from 'react';
import { Controller, type Path, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/format';
import { ApiRequestError, apiErrorMessage } from '@/shared/api/errors';
import { applyServerFieldErrors } from '@/shared/forms/server-errors';
import { useUpdateCampaign } from './api';
import { DeadlineField } from './deadline-field';
import { COMPETITION_THRESHOLD_FIELDS, DEADLINE_LABELS, PARAMETER_FIELDS, SCV_WEIGHT_FIELDS } from './labels';
import { ParameterInputs, ParameterList } from './parameter-fields';
import { addsToTarget, lockedParameterNote } from './running-campaign';
import { ValueListInput } from './value-list-input';

type FormInput = z.input<typeof UpdateRunningCampaignRequestSchema>;

/** Form field names, which are also the paths of the API's 400 issues and 409 `fields`. */
const FIELDS = [
  'name',
  'target.cohorts',
  'target.majors',
  'reason',
  ...CAMPAIGN_DEADLINE_KEYS.map((key) => `phaseDeadlines.${key}`),
  ...[...PARAMETER_FIELDS, ...SCV_WEIGHT_FIELDS].map((parameter) => `config.${parameter.key}`),
  'config.no_preference_policy',
  'config.offer_decline_policy',
  'config.require_full_preferences',
  ...COMPETITION_THRESHOLD_FIELDS.map(({ key }) => `config.competition_thresholds.${key}`),
];

const LOCKED_MESSAGE = 'Giai đoạn hiện tại của đợt không cho sửa mục này nữa.';

function defaultsOf(campaign: Campaign): FormInput {
  const { config } = campaign;
  return {
    rowVersion: campaign.rowVersion,
    name: campaign.name,
    target: { cohorts: [...campaign.target.cohorts], majors: [...campaign.target.majors] },
    phaseDeadlines: { ...campaign.phaseDeadlines },
    // A copy of the nested thresholds too, never the cached campaign's object.
    config: { ...config, competition_thresholds: { ...config.competition_thresholds } },
    reason: '',
  };
}

/** Parameters whose value differs from the stored one and that the phase still lets change. */
function changedConfig(stored: CampaignConfig, next: Partial<CampaignConfig>, phase: CampaignStatus) {
  const changed: Partial<CampaignConfig> = {};
  for (const [key, value] of Object.entries(next) as [keyof CampaignConfig, unknown][]) {
    if (lockedParameterNote(key, phase) !== null) continue;
    // JSON compares `competition_thresholds` by value; the other parameters are numbers or strings.
    if (JSON.stringify(value) !== JSON.stringify(stored[key])) Object.assign(changed, { [key]: value });
  }
  return changed;
}

/** The 409 CAMPAIGN_CONFIG_LOCKED `fields`: what the phase refused while the form was open. */
function lockedFields(error: unknown): string[] {
  if (!(error instanceof ApiRequestError) || error.body?.code !== 'CAMPAIGN_CONFIG_LOCKED') return [];
  const fields = error.body.details?.fields;
  return Array.isArray(fields) ? fields.filter((field): field is string => typeof field === 'string') : [];
}

function ValueBadges({ values }: { values: readonly string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {values.map((value) => (
        <li key={value}>
          <Badge variant="secondary">{value}</Badge>
        </li>
      ))}
    </ul>
  );
}

/**
 * A campaign that has left DRAFT (US-1.10 AC-10, CONTEXT D56), in its actual phase: the name; the
 * target, adding only, during intake; the parameters no phase has used yet; the deadlines still
 * ahead, later or at least DEADLINE_MIN_NOTICE_HOURS from now. One reason goes with every save.
 * Validated with the shared UpdateRunningCampaignRequestSchema; only what changed is sent, and the
 * API checks the phase again. A closed or cancelled campaign is read-only.
 */
export function RunningCampaignForm({ campaign }: { campaign: Campaign }) {
  if (isCampaignFinal(campaign.status)) return <FinishedCampaign campaign={campaign} />;
  return <OpenCampaignForm campaign={campaign} />;
}

function OpenCampaignForm({ campaign }: { campaign: Campaign }) {
  const update = useUpdateCampaign(campaign.id);
  const [formError, setFormError] = useState<string | null>(null);
  // Fixed for the life of the form: what passes while it is open is caught by the API (409).
  const [now] = useState(() => Date.now());
  const phase = actualCampaignPhase(campaign.status, campaign.phaseDeadlines, new Date(now));
  const form = useForm<FormInput, unknown, UpdateCampaignRequest>({
    resolver: zodResolver(UpdateRunningCampaignRequestSchema),
    defaultValues: defaultsOf(campaign),
    mode: 'onTouched',
  });

  const isAhead = (key: CampaignDeadlineKey) => {
    const at = campaign.phaseDeadlines[key];
    return at !== undefined && Date.parse(at) > now;
  };
  const intake = phase === 'INTAKE';

  async function onSubmit(values: UpdateCampaignRequest) {
    setFormError(null);
    // Compare instants, as the API does: the same moment may be written with another offset.
    const instant = (key: CampaignDeadlineKey) => Date.parse(values.phaseDeadlines?.[key] ?? '');
    const before = (key: CampaignDeadlineKey) => Date.parse(campaign.phaseDeadlines[key] ?? '');
    const moved = CAMPAIGN_DEADLINE_KEYS.filter(isAhead).filter((key) => instant(key) !== before(key));
    // An earlier deadline must stay DEADLINE_MIN_NOTICE_HOURS ahead, as the API checks.
    const tooSoon = moved.filter(
      (key) => instant(key) < earliestDeadlineMove(campaign.phaseDeadlines[key] ?? '', new Date(now)).getTime(),
    );
    for (const key of tooSoon) form.setError(`phaseDeadlines.${key}`, { type: 'manual', message: DEADLINE_TOO_SOON });
    if (tooSoon.length > 0) return;

    const name = values.name !== undefined && values.name !== campaign.name ? values.name : undefined;
    const target = intake && values.target && addsToTarget(campaign.target, values.target) ? values.target : undefined;
    const config = changedConfig(campaign.config, values.config ?? {}, phase);
    const hasConfig = Object.keys(config).length > 0;
    if (name === undefined && target === undefined && !hasConfig && moved.length === 0) {
      setFormError('Chưa có mục nào thay đổi.');
      return;
    }
    try {
      await update.mutateAsync({
        rowVersion: campaign.rowVersion,
        ...(name === undefined ? {} : { name }),
        ...(target === undefined ? {} : { target }),
        ...(hasConfig ? { config } : {}),
        ...(moved.length === 0
          ? {}
          : { phaseDeadlines: Object.fromEntries(moved.map((key) => [key, values.phaseDeadlines?.[key]])) }),
        reason: values.reason,
      });
      toast.success('Đã lưu thay đổi', {
        description: moved.length > 0 ? 'Sinh viên và HR của đợt được báo mốc mới kèm lý do.' : undefined,
      });
    } catch (error) {
      applyServerFieldErrors(error, form.setError, FIELDS);
      for (const field of lockedFields(error).filter((path) => FIELDS.includes(path))) {
        form.setError(field as Path<FormInput>, { type: 'server', message: LOCKED_MESSAGE });
      }
      setFormError(apiErrorMessage(error));
    }
  }

  const submitting = form.formState.isSubmitting;

  return (
    <form noValidate onSubmit={(event) => void form.handleSubmit(onSubmit)(event)} className="flex flex-col gap-6">
      {formError && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Chưa lưu được thay đổi</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Đối tượng</CardTitle>
          <CardDescription>
            {intake
              ? 'Trong giai đoạn nhận JD và CV chỉ thêm được khóa, ngành; giá trị đã có giữ nguyên vì sinh viên thuộc đối tượng đã tham gia đợt. Sinh viên mới thuộc đối tượng được báo đợt đã mở.'
              : 'Đã khóa: khóa và ngành chỉ thêm được trong giai đoạn nhận JD và CV.'}
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
                  <Input {...field} id="campaign-name" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            {(['cohorts', 'majors'] as const).map((key) => {
              const label = key === 'cohorts' ? 'Khóa' : 'Ngành';
              if (!intake) {
                return (
                  <Field key={key} aria-labelledby={`campaign-${key}-label`}>
                    <FieldTitle id={`campaign-${key}-label`}>{label}</FieldTitle>
                    <ValueBadges values={campaign.target[key]} />
                  </Field>
                );
              }
              return (
                <Controller
                  key={key}
                  name={`target.${key}`}
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={`campaign-${key}`}>{label}</FieldLabel>
                      <ValueListInput
                        id={`campaign-${key}`}
                        value={field.value ?? []}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        invalid={fieldState.invalid}
                        placeholder={key === 'cohorts' ? 'K67' : 'Kỹ thuật phần mềm'}
                        itemName={key === 'cohorts' ? 'khóa' : 'ngành'}
                        fixed={campaign.target[key]}
                      />
                      <FieldDescription>
                        {key === 'cohorts' ? 'Nhập từng khóa rồi nhấn Enter.' : 'Ghi đúng tên ngành như trong hồ sơ sinh viên.'}
                      </FieldDescription>
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
              );
            })}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mốc thời gian</CardTitle>
          <CardDescription>
            Mốc chưa tới dời được về sau, hoặc sớm hơn nhưng phải cách hiện tại ít nhất {DEADLINE_MIN_NOTICE_HOURS}{' '}
            giờ. Sinh viên và HR của đợt được báo khi mốc đổi. Mốc đã qua không sửa được.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {CAMPAIGN_DEADLINE_KEYS.map((key) => {
              const current = campaign.phaseDeadlines[key];
              const ahead = isAhead(key);
              return (
                <Controller
                  key={key}
                  name={`phaseDeadlines.${key}`}
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid} data-disabled={!ahead || undefined}>
                      <FieldLabel htmlFor={`deadline-${key}`}>{DEADLINE_LABELS[key].label}</FieldLabel>
                      <DeadlineField
                        id={`deadline-${key}`}
                        label={DEADLINE_LABELS[key].label}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        invalid={fieldState.invalid}
                        disabled={!ahead}
                        notBefore={current && ahead ? earliestDeadlineMove(current, new Date(now)) : undefined}
                      />
                      <FieldDescription>
                        {ahead && current
                          ? `${DEADLINE_LABELS[key].description} Hiện tại: ${formatDateTime(current)}.`
                          : 'Mốc đã qua, không sửa được.'}
                      </FieldDescription>
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
              );
            })}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tham số</CardTitle>
          <CardDescription>
            Mỗi tham số chỉ sửa được trước giai đoạn dùng tới nó, để mọi sinh viên của đợt được tính cùng một giá trị.
            {intake && ' Đổi trọng số S_cv lúc này thì điểm phù hợp đã chấm được tính lại.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ParameterInputs
            control={form.control}
            locked={{ config: campaign.config, noteOf: (key) => lockedParameterNote(key, phase) }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lý do sửa</CardTitle>
          <CardDescription>
            Lý do được lưu vào nhật ký thao tác; khi mốc đổi, sinh viên và HR đọc được lý do trong thông báo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Controller
            name="reason"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="campaign-edit-reason">Lý do</FieldLabel>
                <Textarea
                  {...field}
                  id="campaign-edit-reason"
                  placeholder="Ví dụ: nhiều doanh nghiệp đề nghị thêm thời gian đăng JD"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
          {submitting && <Spinner data-icon="inline-start" />}
          {submitting ? 'Đang lưu' : 'Lưu thay đổi'}
        </Button>
      </div>
    </form>
  );
}

/** A closed or cancelled campaign: nothing changes any more (US-1.10 AC-6, AC-7). */
function FinishedCampaign({ campaign }: { campaign: Campaign }) {
  const cancelled = campaign.status === 'CANCELLED';
  return (
    <div className="flex flex-col gap-6">
      <Alert>
        <Info />
        <AlertTitle>{cancelled ? 'Đợt đã hủy' : 'Đợt đã đóng'}</AlertTitle>
        <AlertDescription>
          {cancelled
            ? 'Sinh viên và HR không còn thấy đợt. CV, JD, nguyện vọng, bài test và nhật ký được giữ lại để tra cứu; không sửa được đợt nữa.'
            : 'Đợt đã kết thúc nên không sửa được nữa.'}
        </AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle>Đối tượng</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <dt className="text-sm text-muted-foreground">Khóa</dt>
              <dd>
                <ValueBadges values={campaign.target.cohorts} />
              </dd>
            </div>
            <div className="flex flex-col gap-2">
              <dt className="text-sm text-muted-foreground">Ngành</dt>
              <dd>
                <ValueBadges values={campaign.target.majors} />
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Mốc thời gian</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-4">
            {CAMPAIGN_DEADLINE_KEYS.map((key) => {
              const at = campaign.phaseDeadlines[key];
              return (
                <div key={key} className="flex flex-col gap-1">
                  <dt className="text-sm text-muted-foreground">{DEADLINE_LABELS[key].label}</dt>
                  <dd className="text-sm font-medium">{at ? formatDateTime(at) : 'Không có'}</dd>
                </div>
              );
            })}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Tham số</CardTitle>
        </CardHeader>
        <CardContent>
          <ParameterList config={campaign.config} />
        </CardContent>
      </Card>
    </div>
  );
}
