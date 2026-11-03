import { entryInterval, parseMonth, refMonthOf, unionMonths } from '../period.js';

const month = (year: number, m: number) => year * 12 + m - 1;

/** `intake_end` 2026-07-01 00:30 in Vietnam, still June 30 in UTC. */
const INTAKE_END = new Date('2026-06-30T17:30:00Z');
const REF = month(2026, 7);

describe('GĐ3 CV periods: formats, present uses intake_end, union of intervals (US-3.5 AC-1)', () => {
  it.each([
    ['09/2022', month(2022, 9)],
    ['9/2022', month(2022, 9)],
    ['09-2022', month(2022, 9)],
    ['09.2022', month(2022, 9)],
    ['T9/2022', month(2022, 9)],
    ['t9 - 2022', month(2022, 9)],
    ['tháng 9 2022', month(2022, 9)],
    ['Tháng 9/2022', month(2022, 9)],
    ['tháng 9 năm 2022', month(2022, 9)],
    ['15/09/2022', month(2022, 9)],
    ['2022-09', month(2022, 9)],
    ['2022-09-15', month(2022, 9)],
    ['09/22', month(2022, 9)],
    ['T9/22', month(2022, 9)],
    ['đến 09/2022', month(2022, 9)],
    ['Sep 2022', month(2022, 9)],
    ['September, 2022', month(2022, 9)],
    ['  12/2023 ', month(2023, 12)],
  ])('GĐ3 reads %j as a month', (text, expected) => {
    expect(parseMonth(text, REF)).toBe(expected);
  });

  it('GĐ3 a year alone stands for June of that year (CONTEXT D44)', () => {
    expect(parseMonth('2023', REF)).toBe(month(2023, 6));
    expect(parseMonth('năm 2023', REF)).toBe(month(2023, 6));
    expect(entryInterval('2023', '2023', REF)).toEqual({ first: month(2023, 6), last: month(2023, 6) });
    expect(entryInterval('2023', '2024', REF)).toEqual({ first: month(2023, 6), last: month(2024, 6) });
  });

  it.each(['Hiện tại', 'hiện nay', 'nay', 'Đến nay', 'Tới nay', 'Đến hiện tại', 'to present', 'Present', 'now', 'NOW.'])(
    'GĐ3 %j is the month of intake_end in Vietnam time',
    (text) => {
      expect(refMonthOf(INTAKE_END)).toBe(REF);
      expect(parseMonth(text, refMonthOf(INTAKE_END))).toBe(REF);
    },
  );

  it.each([
    null,
    '',
    'Q3 2022',
    '13/2022',
    '0/2022',
    '32/09/2022',
    '2022-09-32',
    '13/22',
    '2022 – 2023',
    'mùa hè',
    'Sept',
    '1850',
    'Foo 2022',
  ])(
    'GĐ3 %j cannot be read',
    (text) => {
      expect(parseMonth(text, REF)).toBeNull();
    },
  );

  it('GĐ3 an entry counts both ends; its end is cut at intake_end', () => {
    expect(entryInterval('06/2024', '08/2024', REF)).toEqual({ first: month(2024, 6), last: month(2024, 8) });
    expect(entryInterval('02/2026', 'hiện tại', REF)).toEqual({ first: month(2026, 2), last: REF });
    expect(entryInterval('02/2026', '12/2026', REF)).toEqual({ first: month(2026, 2), last: REF });
  });

  it('GĐ3 a missing or unreadable date, an end before the start or a start after intake_end gives no months', () => {
    expect(entryInterval(null, '08/2024', REF)).toBeNull();
    expect(entryInterval('06/2024', null, REF)).toBeNull();
    expect(entryInterval('mùa hè 2024', '08/2024', REF)).toBeNull();
    expect(entryInterval('08/2024', '06/2024', REF)).toBeNull();
    expect(entryInterval('09/2026', 'hiện tại', REF)).toBeNull();
  });

  it('GĐ3 the months of several entries are the union of their intervals', () => {
    const interval = (first: number, last: number) => ({ first: month(2024, first), last: month(2024, last) });
    expect(unionMonths([])).toBe(0);
    expect(unionMonths([interval(1, 3), null])).toBe(3);
    expect(unionMonths([interval(1, 4), interval(3, 6)])).toBe(6);
    expect(unionMonths([interval(3, 6), interval(1, 4), interval(2, 2)])).toBe(6);
    expect(unionMonths([interval(1, 3), interval(4, 5)])).toBe(5);
    expect(unionMonths([interval(1, 2), interval(5, 6)])).toBe(4);
    expect(unionMonths([interval(1, 12), interval(2, 3)])).toBe(12);
  });
});
