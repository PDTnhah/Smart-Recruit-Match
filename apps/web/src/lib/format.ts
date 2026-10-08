import { format, formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

// Date and number formatting for the UI (DESIGN.md §10). The API sends ISO 8601 UTC instants;
// they are shown in the browser's time zone.

type DateInput = Date | string;

function toDate(value: DateInput): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

/** 08/10/2026 */
export function formatDate(value: DateInput): string {
  return format(toDate(value), 'dd/MM/yyyy', { locale: vi });
}

/** 08/10/2026 14:05 (24-hour clock) */
export function formatDateTime(value: DateInput): string {
  return format(toDate(value), 'dd/MM/yyyy HH:mm', { locale: vi });
}

/** 3 phút trước, 2 ngày nữa */
export function formatRelative(value: DateInput): string {
  return formatDistanceToNow(toDate(value), { addSuffix: true, locale: vi });
}

const numberFormats = new Map<number, Intl.NumberFormat>();

/** 3,45 and 1.200 (Vietnamese separators). */
export function formatNumber(value: number, fractionDigits = 0): string {
  let formatter = numberFormats.get(fractionDigits);
  if (!formatter) {
    formatter = new Intl.NumberFormat('vi-VN', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    numberFormats.set(fractionDigits, formatter);
  }
  return formatter.format(value);
}
