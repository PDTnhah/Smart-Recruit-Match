import { zodResolver } from '@hookform/resolvers/zod';
import {
  CAMPAIGN_DEADLINE_KEYS,
  type Campaign,
  type CampaignDeadlineKey,
  DEADLINE_NOT_LATER,
  ExtendDeadlinesRequestSchema,
  type UpdateCampaignRequest,
} from '@srm/shared';
import { CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/shared/api/errors';
import { applyServerFieldErrors } from '@/shared/forms/server-errors';
import { useUpdateCampaign } from './api';
import { DeadlineField } from './deadline-field';
import { DEADLINE_LABELS } from './labels';
import { ParameterList } from './parameter-fields';

type FormInput = z.input<typeof ExtendDeadlinesRequestSchema>;

const FIELDS = ['reason', ...CAMPAIGN_DEADLINE_KEYS.map((key) => `phaseDeadlines.${key}`)];

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
 * A campaign that has left DRAFT (US-1.4 AC-4, AC-9): target and parameters are read-only;
 * deadlines still ahead can move later with a reason. Validated with the shared
 * ExtendDeadlinesRequestSchema; the API also refuses earlier dates and passed deadlines.
 */
export function RunningCampaignForm({ campaign }: { campaign: Campaign }) {
  const update = useUpdateCampaign(campaign.id);
  const [formError, setFormError] = useState<string | null>(null);
  // Fixed for the life of the form: deadlines that passed while it is open are caught by the API.
  const [now] = useState(() => Date.now());
  const form = useForm<FormInput, unknown, UpdateCampaignRequest>({
    resolver: zodResolver(ExtendDeadlinesRequestSchema),
    defaultValues: { rowVersion: campaign.rowVersion, phaseDeadlines: { ...campaign.phaseDeadlines }, reason: '' },
    mode: 'onTouched',
  });

  const isOpen = (key: CampaignDeadlineKey) => {
    const at = campaign.phaseDeadlines[key];
    return at !== undefined && Date.parse(at) > now;
  };
  const editable = CAMPAIGN_DEADLINE_KEYS.filter(isOpen);

  async function onSubmit(values: UpdateCampaignRequest) {
    setFormError(null);
    // Compare instants, as the API does: the same moment may be written with another offset.
    const instant = (key: CampaignDeadlineKey) => Date.parse(values.phaseDeadlines?.[key] ?? '');
    const before = (key: CampaignDeadlineKey) => Date.parse(campaign.phaseDeadlines[key] ?? '');
    const changed = editable.filter((key) => instant(key) !== before(key));
    if (changed.length === 0) {
      setFormError('Chưa có mốc nào thay đổi.');
      return;
    }
    // The calendar blocks earlier days but not an earlier time on the same day.
    const earlier = changed.filter((key) => instant(key) < before(key));
    if (earlier.length > 0) {
      for (const key of earlier) form.setError(`phaseDeadlines.${key}`, { type: 'manual', message: DEADLINE_NOT_LATER });
      return;
    }
    try {
      await update.mutateAsync({
        rowVersion: campaign.rowVersion,
        phaseDeadlines: Object.fromEntries(changed.map((key) => [key, values.phaseDeadlines?.[key]])),
        reason: values.reason,
      });
      toast.success('Đã lùi mốc thời gian');
    } catch (error) {
      applyServerFieldErrors(error, form.setError, FIELDS);
      setFormError(apiErrorMessage(error));
    }
  }

  const submitting = form.formState.isSubmitting;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Đối tượng</CardTitle>
          <CardDescription>Đã khóa từ khi mở đợt.</CardDescription>
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
          <CardDescription>
            Chỉ được lùi các mốc chưa tới, kể cả mốc của giai đoạn đang chạy. Mốc đã qua không sửa được.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
            className="flex flex-col gap-6"
          >
            {formError && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>Chưa lùi được mốc</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <FieldGroup>
              {CAMPAIGN_DEADLINE_KEYS.map((key) => {
                const current = campaign.phaseDeadlines[key];
                const open = isOpen(key);
                return (
                  <Controller
                    key={key}
                    name={`phaseDeadlines.${key}`}
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid} data-disabled={!open || undefined}>
                        <FieldLabel htmlFor={`deadline-${key}`}>{DEADLINE_LABELS[key].label}</FieldLabel>
                        <DeadlineField
                          id={`deadline-${key}`}
                          label={DEADLINE_LABELS[key].label}
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          invalid={fieldState.invalid}
                          disabled={!open}
                          notBefore={current ? new Date(current) : undefined}
                        />
                        <FieldDescription>
                          {open ? DEADLINE_LABELS[key].description : 'Mốc đã qua, không sửa được.'}
                        </FieldDescription>
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )}
                  />
                );
              })}
              {editable.length > 0 && (
                <Controller
                  name="reason"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="deadline-reason">Lý do gia hạn</FieldLabel>
                      <Textarea
                        {...field}
                        id="deadline-reason"
                        placeholder="Ví dụ: nhiều doanh nghiệp đề nghị thêm thời gian đăng JD"
                        aria-invalid={fieldState.invalid}
                      />
                      <FieldDescription>Lý do được lưu vào nhật ký thao tác.</FieldDescription>
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
              )}
            </FieldGroup>
            {editable.length > 0 && (
              <div className="flex justify-end">
                <Button type="submit" disabled={submitting || !form.formState.isDirty} className="w-full sm:w-auto">
                  {submitting && <Spinner data-icon="inline-start" />}
                  {submitting ? 'Đang lưu' : 'Lưu mốc mới'}
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tham số</CardTitle>
          <CardDescription>Đã khóa từ khi mở đợt.</CardDescription>
        </CardHeader>
        <CardContent>
          <ParameterList config={campaign.config} />
        </CardContent>
      </Card>
    </div>
  );
}
