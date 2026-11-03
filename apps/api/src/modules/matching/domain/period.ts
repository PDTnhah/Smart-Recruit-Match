import { REF_UTC_OFFSET_HOURS, YEAR_ONLY_MONTH } from './matching-rules.js';

// Dates of a CV, read to count the months of its experience entries for T4 (FR-40, US-3.5 AC-1,
// CONTEXT D44). Only `experience[].start/end` are read: projects and education add no months.
// A month is the integer year × 12 + (month − 1); an interval includes both ends, so 06/2024 –
// 08/2024 is 3 months. "Hiện tại" is the month of `intake_end`, never the clock (Invariant 9).

/** A month as year × 12 + (month − 1). */
export type MonthIndex = number;

/** Months `first` to `last`, both included; `first` ≤ `last`. */
export interface MonthInterval {
  first: MonthIndex;
  last: MonthIndex;
}

const HOUR_MS = 3_600_000;

const monthIndex = (year: number, month: number): MonthIndex => year * 12 + month - 1;

/** The month of `refDate` in Vietnam time. */
export function refMonthOf(refDate: Date): MonthIndex {
  const local = new Date(refDate.getTime() + REF_UTC_OFFSET_HOURS * HOUR_MS);
  return monthIndex(local.getUTCFullYear(), local.getUTCMonth() + 1);
}

const PRESENT = new Set(['hiện tại', 'hiện nay', 'nay', 'present', 'now', 'current']);

/** "đến nay", "tới 06/2024", "to present": the word before an end date is dropped. */
const UNTIL = /^(?:cho đến|đến|tới|to|until|till)\s+/u;

const MONTH_NAMES: Readonly<Record<string, number>> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/** "09/2022", "9-2022", "T9/2022", "tháng 9 2022", "tháng 9/2022", "tháng 9 năm 2022". */
const MONTH_YEAR = /^(?:(?:tháng|th|t)\s*)?(\d{1,2})\s*(?:[/.-]|,?\s)\s*(?:năm\s*)?(\d{4})$/u;
/** "09/22", "T9/22": a year of this century. */
const MONTH_SHORT_YEAR = /^(?:(?:tháng|th|t)\s*)?(\d{1,2})\s*[/.-]\s*(\d{2})$/u;
/** "15/09/2022": the day is dropped. */
const DAY_MONTH_YEAR = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})$/u;
/** "2022-09", "2022-09-15": the day is dropped. */
const YEAR_MONTH = /^(\d{4})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{1,2}))?$/u;

const SHORT_YEAR_CENTURY = 2000;

const validDay = (day: string | undefined): boolean => day === undefined || (Number(day) >= 1 && Number(day) <= 31);
/** "Sep 2022", "September, 2022". */
const NAMED_MONTH_YEAR = /^([a-z]+)\.?,?\s*(\d{4})$/u;
/** "2022", "năm 2022": June (CONTEXT D44). */
const YEAR_ONLY = /^(?:năm\s*)?(\d{4})$/u;

const MIN_YEAR = 1900;
const MAX_YEAR = 2199;

function validMonth(year: number, month: number): MonthIndex | null {
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12) return null;
  return monthIndex(year, month);
}

/** The month a CV date stands for; `refMonth` for "hiện tại"; null when it cannot be read. */
export function parseMonth(text: string | null, refMonth: MonthIndex): MonthIndex | null {
  if (text === null) return null;
  const value = text.normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim().replace(/\.+$/u, '').replace(UNTIL, '');
  if (PRESENT.has(value)) return refMonth;
  let match = MONTH_YEAR.exec(value);
  if (match) return validMonth(Number(match[2]), Number(match[1]));
  match = MONTH_SHORT_YEAR.exec(value);
  if (match) return validMonth(SHORT_YEAR_CENTURY + Number(match[2]), Number(match[1]));
  match = DAY_MONTH_YEAR.exec(value);
  if (match) return validDay(match[1]) ? validMonth(Number(match[3]), Number(match[2])) : null;
  match = YEAR_MONTH.exec(value);
  if (match) return validDay(match[3]) ? validMonth(Number(match[1]), Number(match[2])) : null;
  match = NAMED_MONTH_YEAR.exec(value);
  if (match) {
    const month = MONTH_NAMES[match[1]!];
    return month === undefined ? null : validMonth(Number(match[2]), month);
  }
  match = YEAR_ONLY.exec(value);
  if (match) return validMonth(Number(match[1]), YEAR_ONLY_MONTH);
  return null;
}

/**
 * The months of one experience entry, the end cut at `refMonth`; null when a date is missing or
 * unreadable, or the entry ends before it starts. The entry is still a source, it just adds no
 * months (AC-1).
 */
export function entryInterval(start: string | null, end: string | null, refMonth: MonthIndex): MonthInterval | null {
  const first = parseMonth(start, refMonth);
  const last = parseMonth(end, refMonth);
  if (first === null || last === null) return null;
  const cut = Math.min(last, refMonth);
  return first <= cut ? { first, last: cut } : null;
}

/** Months covered by the union of `intervals`: a month two entries share counts once. */
export function unionMonths(intervals: Iterable<MonthInterval | null>): number {
  const sorted = [...intervals]
    .filter((interval): interval is MonthInterval => interval !== null)
    .sort((a, b) => a.first - b.first || a.last - b.last);
  let months = 0;
  let covered = Number.NEGATIVE_INFINITY;
  for (const { first, last } of sorted) {
    if (last <= covered) continue;
    months += last - Math.max(first, covered + 1) + 1;
    covered = last;
  }
  return months;
}
