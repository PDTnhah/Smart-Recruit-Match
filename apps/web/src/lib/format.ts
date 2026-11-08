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

/** 14:05 (24-hour clock) */
export function formatTime(value: DateInput): string {
  return format(toDate(value), 'HH:mm', { locale: vi });
}

/** 3 phút trước, 2 ngày nữa */
export function formatRelative(value: DateInput): string {
  return formatDistanceToNow(toDate(value), { addSuffix: true, locale: vi });
}

/** 45 phút, 2 giờ, 1 giờ 30 phút */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} phút`;
  return rest === 0 ? `${hours} giờ` : `${hours} giờ ${rest} phút`;
}

const twoDigits = (value: number) => String(value).padStart(2, '0');

/** 44:59, 1:05:09: what is left of a countdown, rounded up to the second. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${twoDigits(minutes)}:${twoDigits(seconds)}` : `${twoDigits(minutes)}:${twoDigits(seconds)}`;
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
