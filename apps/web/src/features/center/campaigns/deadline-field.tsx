import { set, startOfDay } from 'date-fns';
import { vi } from 'date-fns/locale';
import { CalendarIcon, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDate, formatTime } from '@/lib/format';

/** Time given to a deadline when only the day has been picked. */
const DEFAULT_TIME = '17:00';

interface DeadlineFieldProps {
  /** Id of the day button, for the field label. */
  id: string;
  /** Spoken name of the deadline, for the time input. */
  label: string;
  /** ISO 8601 instant; null or undefined when not set. */
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  onBlur?: () => void;
  invalid?: boolean;
  disabled?: boolean;
  /** Days before this one cannot be picked: a running campaign only moves deadlines later. */
  notBefore?: Date;
  /** Show the clear button (drafts only). */
  clearable?: boolean;
}

/**
 * Day + time of a phase deadline (US-1.4 AC-9): a Calendar in the `vi` locale of date-fns and a
 * 24-hour time input. Picked in the browser's time zone, stored as a UTC instant (DESIGN.md §10).
 */
export function DeadlineField({
  id,
  label,
  value,
  onChange,
  onBlur,
  invalid,
  disabled,
  notBefore,
  clearable = false,
}: DeadlineFieldProps) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(value) : undefined;
  const time = date ? formatTime(date) : DEFAULT_TIME;

  function pickDay(day: Date | undefined) {
    if (!day) return;
    onChange(withTime(day, time).toISOString());
    setOpen(false);
  }

  function changeTime(next: string) {
    if (!date || !/^\d{2}:\d{2}$/.test(next)) return;
    onChange(withTime(date, next).toISOString());
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) onBlur?.();
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={invalid}
            className="min-w-40 justify-start"
          >
            <CalendarIcon data-icon="inline-start" />
            {date ? formatDate(date) : 'Chọn ngày'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={vi}
            selected={date}
            defaultMonth={date ?? notBefore}
            onSelect={pickDay}
            disabled={notBefore ? { before: startOfDay(notBefore) } : undefined}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      <Input
        type="time"
        step={60}
        aria-label={`Giờ, ${label}`}
        value={date ? time : ''}
        onChange={(event) => changeTime(event.target.value)}
        onBlur={onBlur}
        disabled={disabled || !date}
        aria-invalid={invalid}
        className="w-32"
      />
      {clearable && date && !disabled && (
        <Button type="button" variant="ghost" size="icon" aria-label={`Xóa mốc ${label}`} onClick={() => onChange(null)}>
          <X />
        </Button>
      )}
    </div>
  );
}

function withTime(day: Date, time: string): Date {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return set(day, { hours, minutes, seconds: 0, milliseconds: 0 });
}
