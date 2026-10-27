import { JD_FILE_ACCEPT } from '@srm/shared';
import { useState } from 'react';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { formatNumber } from '@/lib/format';
import { checkDocumentFile, MAX_UPLOAD_MB } from '@/shared/files/check-document';

/** File input for the original JD (PDF/DOCX ≤ 5 MB). Calls `onChange(null)` when the choice is invalid. */
export function JdFilePicker({
  id,
  onChange,
  disabled,
  label = 'File JD gốc (không bắt buộc)',
}: {
  id: string;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <Field data-invalid={error !== null}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="file"
        accept={JD_FILE_ACCEPT}
        disabled={disabled}
        aria-invalid={error !== null}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          const problem = file ? checkDocumentFile(file) : null;
          setError(problem);
          onChange(problem ? null : file);
        }}
      />
      <FieldDescription>
        PDF hoặc DOCX, tối đa {formatNumber(MAX_UPLOAD_MB, 0)} MB. File được lưu mã hóa; chỉ HR của doanh nghiệp và Trung
        tâm xem được.
      </FieldDescription>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}
