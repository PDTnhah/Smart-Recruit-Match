import { type CampaignConfig, NO_PREFERENCE_POLICIES, OFFER_DECLINE_POLICIES, SCV_WEIGHT_KEYS } from '@srm/shared';
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
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { formatNumber } from '@/lib/format';
import {
  COMPETITION_THRESHOLD_FIELDS,
  NO_PREFERENCE_POLICY_LABELS,
  OFFER_DECLINE_POLICY_FIELD,
  OFFER_DECLINE_POLICY_LABELS,
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

/**
 * Parameters an open campaign can no longer change (US-1.10 AC-10): shown as text with why, in
 * place of their input.
 */
export interface LockedParameters {
  /** The stored values. */
  config: CampaignConfig;
  /** Why `key` is read-only, or null while it can change. */
  noteOf: (key: keyof CampaignConfig) => string | null;
}

/** `U`: the values the form's resolver returns, when they differ from the inputs. */
interface InputsProps<T extends FieldValues, U extends FieldValues = T> {
  control: Control<T, unknown, U>;
  locked?: LockedParameters | undefined;
}

/** Number inputs of the campaign parameters, bound to `config.<key>` of the form. */
export function ParameterInputs<T extends FieldValues, U extends FieldValues = T>({ control, locked }: InputsProps<T, U>) {
  return (
    <FieldGroup>
      <FieldGroup className="grid gap-x-6 md:grid-cols-2">
        {PARAMETER_FIELDS.map((parameter) => (
          <ParameterInput key={parameter.key} control={control} parameter={parameter} locked={locked} />
        ))}
        <OfferDeclinePolicyInput control={control} locked={locked} />
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
            <ParameterInput key={parameter.key} control={control} parameter={parameter} locked={locked} />
          ))}
        </FieldGroup>
      </FieldSet>
      <FieldSeparator />
      <FieldSet>
        <FieldLegend>{PREFERENCES_TITLE}</FieldLegend>
        <FieldGroup className="grid gap-x-6 md:grid-cols-2">
          <PreferencePolicyInputs control={control} locked={locked} />
          <CompetitionThresholdInputs control={control} locked={locked} />
        </FieldGroup>
      </FieldSet>
    </FieldGroup>
  );
}

/** Q4 (US-5.4, CONTEXT D66): a choice, next to the numbers of GĐ9. */
function OfferDeclinePolicyInput<T extends FieldValues, U extends FieldValues>({ control, locked }: InputsProps<T, U>) {
  const id = 'config-offer_decline_policy';
  const note = locked?.noteOf('offer_decline_policy');
  if (locked && note) {
    return (
      <LockedValue
        id={id}
        label={OFFER_DECLINE_POLICY_FIELD.label}
        value={OFFER_DECLINE_POLICY_LABELS[locked.config.offer_decline_policy]}
        note={note}
      />
    );
  }
  return (
    <Controller
      name={'config.offer_decline_policy' as Path<T>}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={id}>{OFFER_DECLINE_POLICY_FIELD.label}</FieldLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id={id} ref={field.ref} className="w-full" aria-invalid={fieldState.invalid} onBlur={field.onBlur}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OFFER_DECLINE_POLICIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {OFFER_DECLINE_POLICY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>{OFFER_DECLINE_POLICY_FIELD.description}</FieldDescription>
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}

/** Q6 and "chọn đủ N_NV" (US-3.3 AC-19, CONTEXT D47): choices, not numbers. */
function PreferencePolicyInputs<T extends FieldValues, U extends FieldValues>({ control, locked }: InputsProps<T, U>) {
  const policy = PREFERENCE_POLICY_FIELDS.no_preference_policy;
  const full = PREFERENCE_POLICY_FIELDS.require_full_preferences;
  const policyNote = locked?.noteOf('no_preference_policy');
  const fullNote = locked?.noteOf('require_full_preferences');
  return (
    <>
      {locked && policyNote ? (
        <LockedValue
          id="config-no_preference_policy"
          label={policy.label}
          value={NO_PREFERENCE_POLICY_LABELS[locked.config.no_preference_policy]}
          note={policyNote}
        />
      ) : (
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
      )}
      {locked && fullNote ? (
        <LockedValue
          id="config-require_full_preferences"
          label={full.label}
          value={REQUIRE_FULL_PREFERENCES_LABELS[locked.config.require_full_preferences ? 'true' : 'false']}
          note={fullNote}
        />
      ) : (
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
      )}
    </>
  );
}

/** Where the competition level of a JD changes (US-3.4 AC-9): two ratios, two decimals at most. */
function CompetitionThresholdInputs<T extends FieldValues, U extends FieldValues>({
  control,
  locked,
}: InputsProps<T, U>) {
  const note = locked?.noteOf('competition_thresholds');
  return COMPETITION_THRESHOLD_FIELDS.map(({ key, label, description }) =>
    locked && note ? (
      <LockedValue
        key={key}
        id={`config-competition_thresholds-${key}`}
        label={label}
        value={formatParameter(locked.config.competition_thresholds[key])}
        note={note}
      />
    ) : (
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
    ),
  );
}

function ParameterInput<T extends FieldValues, U extends FieldValues>({
  control,
  parameter,
  locked,
}: InputsProps<T, U> & { parameter: ParameterField }) {
  const note = locked?.noteOf(parameter.key);
  if (locked && note) {
    return (
      <LockedValue
        id={`config-${parameter.key}`}
        label={parameter.label}
        value={formatParameter(locked.config[parameter.key])}
        note={note}
      />
    );
  }
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

interface NumberInputProps<T extends FieldValues, U extends FieldValues> {
  control: Control<T, unknown, U>;
  name: Path<T>;
  id: string;
  label: string;
  description: string;
  step: number;
  /** Fields whose error depends on this one, checked again when it changes. */
  deps?: Path<T>[];
}

function NumberInput<T extends FieldValues, U extends FieldValues>({
  control,
  name,
  id,
  label,
  description,
  step,
  deps,
}: NumberInputProps<T, U>) {
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

/** A parameter the phase no longer lets change: its value and why, named for screen readers. */
function LockedValue({ id, label, value, note }: { id: string; label: string; value: string; note: string }) {
  return (
    <Field aria-labelledby={`${id}-label`} aria-describedby={`${id}-note`}>
      <FieldTitle id={`${id}-label`}>{label}</FieldTitle>
      <p className="text-sm font-medium tabular-nums">{value}</p>
      <FieldDescription id={`${id}-note`}>{note}</FieldDescription>
    </Field>
  );
}

/** The same parameters, read-only, once the campaign is over (US-1.4 AC-9, US-1.10). */
export function ParameterList({ config }: { config: CampaignConfig }) {
  return (
    <div className="flex flex-col gap-4">
      <ParameterValues config={config} fields={PARAMETER_FIELDS} />
      <dl className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">{OFFER_DECLINE_POLICY_FIELD.label}</dt>
          <dd className="text-sm font-medium">{OFFER_DECLINE_POLICY_LABELS[config.offer_decline_policy]}</dd>
        </div>
      </dl>
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
            <dd className="text-sm font-medium tabular-nums">{formatParameter(config.competition_thresholds[key])}</dd>
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
          <dd className="text-sm font-medium tabular-nums">{formatParameter(config[parameter.key])}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 0,4 and 1,5 rather than 0,40 and 1,50; parameters have at most two decimals. */
function formatParameter(value: number): string {
  return formatNumber(value, Math.min((String(value).split('.')[1] ?? '').length, 2));
}
