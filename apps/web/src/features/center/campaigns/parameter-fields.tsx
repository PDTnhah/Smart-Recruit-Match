import { type CampaignConfig, NO_PREFERENCE_POLICIES, SCV_WEIGHT_KEYS } from '@srm/shared';
import { type Control, Controller, type FieldValues, type Path } from 'react-hook-form';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { formatNumber } from '@/lib/format';
import {
  COMPETITION_THRESHOLD_FIELDS,
  NO_PREFERENCE_POLICY_LABELS,
  PARAMETER_FIELDS,
  type ParameterField,
  PREFERENCE_POLICY_FIELDS,
  REQUIRE_FULL_PREFERENCES_LABELS,
  SCV_WEIGHT_FIELDS,
} from './labels';

const SCV_WEIGHTS_TITLE = 'Trọng số điểm phù hợp CV (S_cv)';
const PREFERENCES_TITLE = 'Chọn nguyện vọng';

/**
 * The shared schema puts a sum error on the last field of the sum, and React Hook Form re-checks
 * only the field being changed. Changing another field of the sum re-checks that one too, so the
 * error goes away once the sum is fixed.
 */
const SUM_ERROR_FIELD: Partial<Record<keyof CampaignConfig, keyof CampaignConfig>> = {
  alpha: 'beta',
  ...Object.fromEntries(
    SCV_WEIGHT_KEYS.filter((key) => key !== 'scv_weight_language').map((key) => [key, 'scv_weight_language']),
  ),
};

/** Number inputs of the campaign parameters, bound to `config.<key>` of the form. */
export function ParameterInputs<T extends FieldValues>({ control }: { control: Control<T> }) {
  return (
    <FieldGroup>
      <FieldGroup className="grid gap-x-6 md:grid-cols-2">
        {PARAMETER_FIELDS.map((parameter) => (
          <ParameterInput key={parameter.key} control={control} parameter={parameter} />
        ))}
      </FieldGroup>
      <FieldSeparator />
      <FieldSet>
        <FieldLegend>{SCV_WEIGHTS_TITLE}</FieldLegend>
        <FieldDescription>
          Mức đóng góp của từng tiêu chí vào S_cv. Mỗi trọng số từ 0 đến 1, tổng 5 trọng số bằng 1. JD không có kỹ
          năng bổ trợ hoặc không yêu cầu ngoại ngữ thì trọng số của tiêu chí đó chia lại cho các tiêu chí còn lại.
        </FieldDescription>
        <FieldGroup className="grid gap-x-6 md:grid-cols-2">
          {SCV_WEIGHT_FIELDS.map((parameter) => (
            <ParameterInput key={parameter.key} control={control} parameter={parameter} />
          ))}
        </FieldGroup>
      </FieldSet>
      <FieldSeparator />
      <FieldSet>
        <FieldLegend>{PREFERENCES_TITLE}</FieldLegend>
        <FieldGroup className="grid gap-x-6 md:grid-cols-2">
          <PreferencePolicyInputs control={control} />
          <CompetitionThresholdInputs control={control} />
        </FieldGroup>
      </FieldSet>
    </FieldGroup>
  );
}

/** Q6 and "chọn đủ N_NV" (US-3.3 AC-19, CONTEXT D47): choices, not numbers. */
function PreferencePolicyInputs<T extends FieldValues>({ control }: { control: Control<T> }) {
  const policy = PREFERENCE_POLICY_FIELDS.no_preference_policy;
  const full = PREFERENCE_POLICY_FIELDS.require_full_preferences;
  return (
    <>
      <Controller
        name={'config.no_preference_policy' as Path<T>}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="config-no_preference_policy">{policy.label}</FieldLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id="config-no_preference_policy"
                ref={field.ref}
                className="w-full"
                aria-invalid={fieldState.invalid}
                onBlur={field.onBlur}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NO_PREFERENCE_POLICIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {NO_PREFERENCE_POLICY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>{policy.description}</FieldDescription>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        name={'config.require_full_preferences' as Path<T>}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="config-require_full_preferences">{full.label}</FieldLabel>
            {/* Radix Select carries strings; the form keeps the boolean. */}
            <Select value={String(field.value === true)} onValueChange={(next) => field.onChange(next === 'true')}>
              <SelectTrigger
                id="config-require_full_preferences"
                ref={field.ref}
                className="w-full"
                aria-invalid={fieldState.invalid}
                onBlur={field.onBlur}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['false', 'true'] as const).map((value) => (
                  <SelectItem key={value} value={value}>
                    {REQUIRE_FULL_PREFERENCES_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>{full.description}</FieldDescription>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
    </>
  );
}

/** Where the competition level of a JD changes (US-3.4 AC-9): two ratios, two decimals at most. */
function CompetitionThresholdInputs<T extends FieldValues>({ control }: { control: Control<T> }) {
  return COMPETITION_THRESHOLD_FIELDS.map(({ key, label, description }) => (
    <NumberInput
      key={key}
      control={control}
      name={`config.competition_thresholds.${key}` as Path<T>}
      id={`config-competition_thresholds-${key}`}
      label={label}
      description={description}
      step={0.01}
      // The shared schema reports the order error on high_from; changing low_below re-checks it.
      deps={key === 'low_below' ? [`config.competition_thresholds.high_from` as Path<T>] : undefined}
    />
  ));
}

function ParameterInput<T extends FieldValues>({ control, parameter }: { control: Control<T>; parameter: ParameterField }) {
  const sumField = SUM_ERROR_FIELD[parameter.key];
  return (
    <NumberInput
      control={control}
      name={`config.${parameter.key}` as Path<T>}
      id={`config-${parameter.key}`}
      label={parameter.label}
      description={parameter.description}
      step={parameter.step}
      deps={sumField ? [`config.${sumField}` as Path<T>] : undefined}
    />
  );
}

interface NumberInputProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  id: string;
  label: string;
  description: string;
  step: number;
  /** Fields whose error depends on this one, checked again when it changes. */
  deps?: Path<T>[];
}

function NumberInput<T extends FieldValues>({ control, name, id, label, description, step, deps }: NumberInputProps<T>) {
  return (
    <Controller
      name={name}
      control={control}
      rules={deps ? { deps } : undefined}
      render={({ field, fieldState }) => {
        const value = field.value as number | undefined;
        return (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Input
              id={id}
              name={field.name}
              ref={field.ref}
              type="number"
              inputMode="decimal"
              step={step}
              // An emptied input becomes NaN, which the shared schema reports as "phải là một số".
              value={value === undefined || Number.isNaN(value) ? '' : value}
              onChange={(event) =>
                field.onChange(event.target.value === '' ? Number.NaN : event.target.valueAsNumber)
              }
              onBlur={field.onBlur}
              aria-invalid={fieldState.invalid}
              className="tabular-nums"
            />
            <FieldDescription>{description}</FieldDescription>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        );
      }}
    />
  );
}

/** The same parameters, read-only, once the campaign has left DRAFT (US-1.4 AC-9). */
export function ParameterList({ config }: { config: CampaignConfig }) {
  return (
    <div className="flex flex-col gap-4">
      <ParameterValues config={config} fields={PARAMETER_FIELDS} />
      <Separator />
      <h3 className="text-base font-medium">{SCV_WEIGHTS_TITLE}</h3>
      <ParameterValues config={config} fields={SCV_WEIGHT_FIELDS} />
      <Separator />
      <h3 className="text-base font-medium">{PREFERENCES_TITLE}</h3>
      <dl className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">{PREFERENCE_POLICY_FIELDS.no_preference_policy.label}</dt>
          <dd className="text-sm font-medium">{NO_PREFERENCE_POLICY_LABELS[config.no_preference_policy]}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">{PREFERENCE_POLICY_FIELDS.require_full_preferences.label}</dt>
          <dd className="text-sm font-medium">
            {REQUIRE_FULL_PREFERENCES_LABELS[config.require_full_preferences ? 'true' : 'false']}
          </dd>
        </div>
        {COMPETITION_THRESHOLD_FIELDS.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium tabular-nums">
              {formatNumber(config.competition_thresholds[key], decimalsOf(config.competition_thresholds[key]))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ParameterValues({ config, fields }: { config: CampaignConfig; fields: readonly ParameterField[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 md:grid-cols-2">
      {fields.map((parameter) => (
        <div key={parameter.key} className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">{parameter.label}</dt>
          <dd className="text-sm font-medium tabular-nums">
            {formatNumber(config[parameter.key], decimalsOf(config[parameter.key]))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** 0,4 and 1,5 rather than 0,40 and 1,50; parameters have at most two decimals. */
function decimalsOf(value: number): number {
  return Math.min((String(value).split('.')[1] ?? '').length, 2);
}
