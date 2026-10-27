import { normalizeAudienceValue } from '@srm/shared';
import { X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ValueListInputProps {
  id: string;
  value: string[];
  onChange: (value: string[]) => void;
  onBlur?: () => void;
  invalid?: boolean;
  placeholder?: string;
  /** What one value is, e.g. "khóa"; read out on the remove buttons. */
  itemName: string;
  disabled?: boolean;
}

/**
 * A short list of values (cohorts, majors): type one and press Enter, a comma or "Thêm"; each value
 * shows as a button that removes it. Values differing only in case count as the same.
 */
export function ValueListInput({
  id,
  value,
  onChange,
  onBlur,
  invalid,
  placeholder,
  itemName,
  disabled,
}: ValueListInputProps) {
  const [draft, setDraft] = useState('');

  function add() {
    const next = draft.trim();
    if (!next) return;
    if (!value.some((item) => normalizeAudienceValue(item) === normalizeAudienceValue(next))) {
      onChange([...value, next]);
    }
    setDraft('');
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          aria-invalid={invalid}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add();
            }
          }}
          onBlur={() => {
            add();
            onBlur?.();
          }}
        />
        <Button type="button" variant="outline" onClick={add} disabled={disabled}>
          Thêm
        </Button>
      </div>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((item) => (
            <li key={item}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={disabled}
                onClick={() => onChange(value.filter((other) => other !== item))}
              >
                <span className="sr-only">Xóa {itemName}</span>
                {item}
                <X data-icon="inline-end" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
