import type { CampaignConfig } from '@srm/shared';
import { type Control, Controller, type FieldValues, type Path } from 'react-hook-form';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { formatNumber } from '@/lib/format';
import { PARAMETER_FIELDS } from './labels';

/** Number inputs of the campaign parameters, bound to `config.<key>` of the form. */
export function ParameterInputs<T extends FieldValues>({ control }: { control: Control<T> }) {
  return (
    <FieldGroup className="grid gap-x-6 md:grid-cols-2">
      {PARAMETER_FIELDS.map((parameter) => (
        <Controller
          key={parameter.key}
          name={`config.${parameter.key}` as Path<T>}
          control={control}
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
      ))}
    </FieldGroup>
  );
}

/** The same parameters, read-only, once the campaign has left DRAFT (US-1.4 AC-9). */
export function ParameterList({ config }: { config: CampaignConfig }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 md:grid-cols-2">
      {PARAMETER_FIELDS.map((parameter) => (
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
