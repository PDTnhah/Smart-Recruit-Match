import { JD_FILE_ACCEPT, MAX_UPLOAD_BYTES } from '@srm/shared';
import { useState } from 'react';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { formatNumber } from '@/lib/format';

const MAX_MB = MAX_UPLOAD_BYTES / (1024 * 1024);

/**
 * Early feedback before an upload: name and size only. The API decides by the file's content
 * (415) and refuses anything over 5 MB (413), whatever the browser let through.
 */
function checkJdFile(file: File): string | null {
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension !== 'pdf' && extension !== 'docx') return 'Chỉ nhận file PDF hoặc DOCX.';
  if (file.size > MAX_UPLOAD_BYTES) return `File lớn hơn ${MAX_MB} MB. Chọn file nhỏ hơn.`;
  return null;
}

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
          const problem = file ? checkJdFile(file) : null;
          setError(problem);
          onChange(problem ? null : file);
        }}
      />
      <FieldDescription>
        PDF hoặc DOCX, tối đa {formatNumber(MAX_MB, 0)} MB. File được lưu mã hóa; chỉ HR của doanh nghiệp và Trung
        tâm xem được.
      </FieldDescription>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}
