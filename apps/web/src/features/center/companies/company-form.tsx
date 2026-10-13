import { zodResolver } from '@hookform/resolvers/zod';
import { type Company, type CreateCompanyRequest, CreateCompanyRequestSchema } from '@srm/shared';
import { CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { Controller, type FieldPath, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { apiErrorMessage } from '@/shared/api/errors';
import { applyServerFieldErrors } from '@/shared/forms/server-errors';
import { useCreateCompany, useUpdateCompany } from './api';
import { companyPath } from './paths';

type FormInput = z.input<typeof CreateCompanyRequestSchema>;

interface TextField {
  name: FieldPath<FormInput>;
  label: string;
  autoComplete?: string;
  type?: 'email' | 'tel';
}

const COMPANY_FIELDS: readonly TextField[] = [
  { name: 'name', label: 'Tên doanh nghiệp', autoComplete: 'organization' },
  { name: 'field', label: 'Lĩnh vực' },
  { name: 'address', label: 'Địa chỉ', autoComplete: 'street-address' },
];

const CONTACT_FIELDS: readonly TextField[] = [
  { name: 'contact.name', label: 'Họ tên người liên hệ', autoComplete: 'name' },
  { name: 'contact.email', label: 'Email người liên hệ', autoComplete: 'email', type: 'email' },
  { name: 'contact.phone', label: 'Số điện thoại', autoComplete: 'tel', type: 'tel' },
];

/** Field names, also the paths of the API's 400 issues. */
const FIELDS = [...COMPANY_FIELDS, ...CONTACT_FIELDS].map((field) => field.name);

function defaultsOf(company: Company | undefined): FormInput {
  return {
    name: company?.name ?? '',
    field: company?.field ?? '',
    address: company?.address ?? '',
    contact: {
      name: company?.contact.name ?? '',
      email: company?.contact.email ?? '',
      phone: company?.contact.phone ?? '',
    },
  };
}

/**
 * Create a company or edit one (US-1.5 AC-1, AC-10), validated with the shared schema the API
 * checks. Empty optional fields are sent as empty strings and stored as "not set".
 */
export function CompanyForm({ company }: { company?: Company }) {
  const navigate = useNavigate();
  const create = useCreateCompany();
  const update = useUpdateCompany(company?.id ?? 0);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<FormInput, unknown, CreateCompanyRequest>({
    resolver: zodResolver(CreateCompanyRequestSchema),
    defaultValues: defaultsOf(company),
    mode: 'onTouched',
  });

  async function onSubmit(values: CreateCompanyRequest) {
    setFormError(null);
    try {
      if (company) {
        await update.mutateAsync(values);
        toast.success('Đã lưu thông tin doanh nghiệp');
      } else {
        const created = await create.mutateAsync(values);
        toast.success('Đã thêm doanh nghiệp');
        void navigate(companyPath(created.id), { replace: true });
      }
    } catch (error) {
      applyServerFieldErrors(error, form.setError, FIELDS);
      setFormError(apiErrorMessage(error));
    }
  }

  const submitting = form.formState.isSubmitting;

  const renderField = ({ name, label, autoComplete, type }: TextField, autoFocus = false) => (
    <Controller
      key={name}
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`company-${name}`}>{label}</FieldLabel>
          <Input
            {...field}
            value={typeof field.value === 'string' ? field.value : ''}
            id={`company-${name}`}
            type={type ?? 'text'}
            autoComplete={autoComplete ?? 'off'}
            autoFocus={autoFocus}
            aria-invalid={fieldState.invalid}
          />
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );

  return (
    <form noValidate onSubmit={(event) => void form.handleSubmit(onSubmit)(event)} className="flex flex-col gap-6">
      {formError && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{company ? 'Chưa lưu được thay đổi' : 'Chưa thêm được doanh nghiệp'}</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Thông tin doanh nghiệp</CardTitle>
          <CardDescription>Doanh nghiệp do Trung tâm thêm được coi là đã duyệt và có thể mời HR ngay.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>{COMPANY_FIELDS.map((field, index) => renderField(field, !company && index === 0))}</FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Người liên hệ</CardTitle>
          <CardDescription>Không bắt buộc. Dùng khi Trung tâm cần liên hệ doanh nghiệp.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>{CONTACT_FIELDS.map((field) => renderField(field))}</FieldGroup>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
          {submitting && <Spinner data-icon="inline-start" />}
          {submitting ? 'Đang lưu' : company ? 'Lưu thay đổi' : 'Thêm doanh nghiệp'}
        </Button>
      </div>
    </form>
  );
}
