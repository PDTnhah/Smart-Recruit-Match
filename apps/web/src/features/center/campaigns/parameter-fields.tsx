import { type CampaignConfig, SCV_WEIGHT_KEYS } from '@srm/shared';
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
import { Separator } from '@/components/ui/separator';
import { formatNumber } from '@/lib/format';
import { PARAMETER_FIELDS, type ParameterField, SCV_WEIGHT_FIELDS } from './labels';

const SCV_WEIGHTS_TITLE = 'Trọng số điểm phù hợp CV (S_cv)';

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
    </FieldGroup>
  );
}

function ParameterInput<T extends FieldValues>({ control, parameter }: { control: Control<T>; parameter: ParameterField }) {
  const sumField = SUM_ERROR_FIELD[parameter.key];
  return (
    <Controller
      name={`config.${parameter.key}` as Path<T>}
      control={control}
      rules={sumField ? { deps: [`config.${sumField}` as Path<T>] } : undefined}
      render={({ field, fieldState }) => {
        const value = field.value as number | undefined;
        return (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`config-${parameter.key}`}>{parameter.label}</FieldLabel>
            <Input
              id={`config-${parameter.key}`}
              name={field.name}
              ref={field.ref}
              type="number"
              inputMode="decimal"
              step={parameter.step}
              // An emptied input becomes NaN, which the shared schema reports as "phải là một số".
              value={value === undefined || Number.isNaN(value) ? '' : value}
              onChange={(event) =>
                field.onChange(event.target.value === '' ? Number.NaN : event.target.valueAsNumber)
              }
              onBlur={field.onBlur}
              aria-invalid={fieldState.invalid}
              className="tabular-nums"
            />
            <FieldDescription>{parameter.description}</FieldDescription>
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
