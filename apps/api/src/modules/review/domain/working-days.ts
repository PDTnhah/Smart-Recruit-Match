// HR's review deadline (PRD GĐ8 step 4, FR-29, US-5.3 AC-10, CONTEXT D65): SLA_HR working days
// after the round is published, Monday to Friday in Vietnam's time, with no holiday calendar. The
// reminder goes 2 working days before the deadline. Pure functions: no clock, no database.

/** Vietnam keeps UTC+7 all year (no daylight saving), so local days are counted at a fixed offset. */
export const REVIEW_UTC_OFFSET_HOURS = 7;

/** "Nhắc tự động trước hạn 2 ngày", counted in working days like the SLA (CONTEXT D65). */
export const REMINDER_WORKING_DAYS = 2;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const OFFSET_MS = REVIEW_UTC_OFFSET_HOURS * HOUR_MS;

function isWorkingDay(localMs: number): boolean {
  const weekday = new Date(localMs).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

/**
 * `from` moved by `days` working days, keeping the local time of day: each step goes one calendar
 * day forward (or back, for a negative `days`) and counts only when it lands on Monday–Friday.
 * Friday 10:00 + 1 is Monday 10:00; Saturday 10:00 + 1 is Monday 10:00 too.
 */
export function addWorkingDays(from: Date, days: number): Date {
  if (!Number.isInteger(days)) throw new RangeError(`addWorkingDays: ${days} is not a whole number of days`);
  const step = days < 0 ? -DAY_MS : DAY_MS;
  let local = from.getTime() + OFFSET_MS;
  for (let left = Math.abs(days); left > 0; ) {
    local += step;
    if (isWorkingDay(local)) left -= 1;
  }
  return new Date(local - OFFSET_MS);
}

/**
 * Working days from `from` to `to`: the Monday–Friday dates after `from`'s date, up to and
 * including `to`'s date, in local time. Negative when `to` is earlier; 0 on the same date.
 */
export function workingDaysBetween(from: Date, to: Date): number {
  const dayOf = (date: Date) => Math.floor((date.getTime() + OFFSET_MS) / DAY_MS);
  const [start, end] = [dayOf(from), dayOf(to)];
  const sign = end < start ? -1 : 1;
  let count = 0;
  for (let day = Math.min(start, end) + 1; day <= Math.max(start, end); day += 1) {
    if (isWorkingDay(day * DAY_MS)) count += 1;
  }
  return sign * count;
}

/** The default deadline of a round's nominations: `publishedAt` + SLA_HR working days. */
export function reviewDueAt(publishedAt: Date, slaWorkingDays: number): Date {
  return addWorkingDays(publishedAt, slaWorkingDays);
}

/** OPEN before the reminder, DUE_SOON from 2 working days before the deadline, OVERDUE from it on. */
export type ReviewSlaState = 'OPEN' | 'DUE_SOON' | 'OVERDUE';

export function reviewSlaState(now: Date, dueAt: Date): ReviewSlaState {
  if (now.getTime() >= dueAt.getTime()) return 'OVERDUE';
  if (now.getTime() >= addWorkingDays(dueAt, -REMINDER_WORKING_DAYS).getTime()) return 'DUE_SOON';
  return 'OPEN';
}
