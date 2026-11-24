// GĐ8 step 4 (FR-29, US-5.3 AC-10, CONTEXT D65): HR's deadline in working days, Monday–Friday at
// UTC+7, no holidays; the reminder 2 working days before it.
import { addWorkingDays, reviewDueAt, reviewSlaState, workingDaysBetween } from '../working-days.js';

/** A local time in Vietnam (UTC+7). */
const vn = (local: string) => new Date(`${local}+07:00`);

describe('GĐ8 working days (US-5.3 AC-10)', () => {
  // 2026-11-23 is a Monday.
  it.each([
    ['Monday + 5 → next Monday, same time', '2026-11-23T10:00:00', 5, '2026-11-30T10:00:00'],
    ['Friday + 1 → Monday', '2026-11-27T10:00:00', 1, '2026-11-30T10:00:00'],
    ['Saturday + 1 → Monday', '2026-11-28T10:00:00', 1, '2026-11-30T10:00:00'],
    ['Saturday + 5 → Friday', '2026-11-28T10:00:00', 5, '2026-12-04T10:00:00'],
    ['Monday − 2 → Thursday before', '2026-11-30T10:00:00', -2, '2026-11-26T10:00:00'],
    ['+ 0 keeps the instant', '2026-11-28T10:00:00', 0, '2026-11-28T10:00:00'],
  ])('%s', (_name, from, days, expected) => {
    expect(addWorkingDays(vn(from), days)).toEqual(vn(expected));
  });

  it('counts days in Vietnam time (UTC+7), not in UTC', () => {
    // Friday 23:30 in Vietnam is 16:30 UTC; + 1 working day is Monday 23:30 local.
    expect(addWorkingDays(vn('2026-11-27T23:30:00'), 1)).toEqual(vn('2026-11-30T23:30:00'));
    // Saturday 00:30 in Vietnam is still Friday 17:30 UTC: it must count as Saturday.
    expect(addWorkingDays(vn('2026-11-28T00:30:00'), 1)).toEqual(vn('2026-11-30T00:30:00'));
  });

  it('rejects a fraction of a day', () => {
    expect(() => addWorkingDays(vn('2026-11-23T10:00:00'), 1.5)).toThrow(RangeError);
  });

  it('workingDaysBetween skips weekends and is signed', () => {
    expect(workingDaysBetween(vn('2026-11-27T10:00:00'), vn('2026-11-30T09:00:00'))).toBe(1);
    expect(workingDaysBetween(vn('2026-11-23T10:00:00'), vn('2026-11-30T10:00:00'))).toBe(5);
    expect(workingDaysBetween(vn('2026-11-23T10:00:00'), vn('2026-11-23T18:00:00'))).toBe(0);
    expect(workingDaysBetween(vn('2026-11-30T10:00:00'), vn('2026-11-26T10:00:00'))).toBe(-2);
  });

  it('SLA_HR 5 from a Monday publication: reminder on Thursday, overdue next Monday', () => {
    const due = reviewDueAt(vn('2026-11-23T10:00:00'), 5);
    expect(due).toEqual(vn('2026-11-30T10:00:00'));
    expect(reviewSlaState(vn('2026-11-26T09:59:59'), due)).toBe('OPEN');
    expect(reviewSlaState(vn('2026-11-26T10:00:00'), due)).toBe('DUE_SOON');
    // The weekend does not count: Saturday is still DUE_SOON, not overdue.
    expect(reviewSlaState(vn('2026-11-28T12:00:00'), due)).toBe('DUE_SOON');
    expect(reviewSlaState(vn('2026-11-30T10:00:00'), due)).toBe('OVERDUE');
  });
});
