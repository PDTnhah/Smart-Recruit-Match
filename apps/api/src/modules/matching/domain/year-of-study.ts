import type { CvProfileMasked } from '@srm/shared';
import { type MonthIndex, parseMonth, refMonthOf } from './period.js';

// The year of study of a student, read by code from the confirmed profile for the hard filter
// (FR-14, US-3.2 AC-16, CONTEXT D46). Schools here write no cohort ("K66") in a CV, so the profile
// is read as the student wrote it: first "sinh viên năm 3", else the dates of the ongoing education
// entry. "Hiện tại" is `intake_end` of the campaign, never the clock (Invariant 9).

export const MIN_YEAR_OF_STUDY = 1;
export const MAX_YEAR_OF_STUDY = 6;

type CvEducation = CvProfileMasked['education'][number];

/** A school year starts in September: 10/2025 is in 2025–2026, 06/2026 too. */
const SCHOOL_YEAR_FIRST_MONTH = 9;

const ORDINAL_WORDS: Readonly<Record<string, number>> = {
  nhất: 1,
  một: 1,
  hai: 2,
  ba: 3,
  tư: 4,
  bốn: 4,
  sáu: 6,
};

const ENGLISH_ORDINALS: Readonly<Record<string, number>> = {
  first: 1,
  '1st': 1,
  second: 2,
  '2nd': 2,
  third: 3,
  '3rd': 3,
  fourth: 4,
  '4th': 4,
  fifth: 5,
  '5th': 5,
  sixth: 6,
  '6th': 6,
};

/**
 * "sinh viên năm 3", "SV năm thứ ba", "sinh viên năm tư"; "năm năm" only after "thứ". "Năm cuối"
 * names no year and does not match.
 */
const VIETNAMESE = /(?:sinh viên|sv)\s+năm\s+(thứ\s+)?(\d|[\p{L}]+)(?![\p{L}\p{N}])/u;

/** "third-year student", "3rd year undergraduate". "Final-year" names no year. */
const ENGLISH = /\b(first|second|third|fourth|fifth|sixth|1st|2nd|3rd|4th|5th|6th)[-\s]year\s+(?:student|undergraduate)\b/u;

/** "dự kiến 06/2027", "expected 2027": a planned end is still an end. */
const PLANNED = /^(?:dự kiến|expected|est\.?)\s*/u;

const normalize = (text: string): string => text.normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim();

const inRange = (year: number): number | null =>
  Number.isInteger(year) && year >= MIN_YEAR_OF_STUDY && year <= MAX_YEAR_OF_STUDY ? year : null;

/** The year a phrase of the text names, or null. */
export function statedYear(text: string | null): number | null {
  if (text === null) return null;
  const value = normalize(text);
  const vietnamese = VIETNAMESE.exec(value);
  if (vietnamese) {
    const [, ordinal, word = ''] = vietnamese;
    if (/^\d$/u.test(word)) return inRange(Number(word));
    if (word === 'năm') return ordinal === undefined ? null : 5;
    return inRange(ORDINAL_WORDS[word] ?? 0);
  }
  const english = ENGLISH.exec(value);
  return english ? (ENGLISH_ORDINALS[english[1]!] ?? null) : null;
}

const schoolYearOf = (month: MonthIndex): number => {
  const year = Math.floor(month / 12);
  return month % 12 >= SCHOOL_YEAR_FIRST_MONTH - 1 ? year : year - 1;
};

/** Started by `refMonth` and not ended before it: no end, "hiện tại", or an end still to come. */
function ongoingStart(entry: CvEducation, refMonth: MonthIndex): MonthIndex | null {
  const start = parseMonth(entry.start, refMonth);
  if (start === null || start > refMonth) return null;
  if (entry.end === null) return start;
  const end = parseMonth(normalize(entry.end).replace(PLANNED, ''), refMonth);
  return end !== null && end >= refMonth ? start : null;
}

/**
 * The year of study on `refDate` (`intake_end`), 1 to 6, or null when the profile tells neither
 * (the hard filter then gives YEAR_MISSING). A year stated in the summary, then in an education
 * entry, wins over dates. Else the ongoing entry that started last: the school year holding
 * `refDate` minus the calendar year it started, plus 1, kept within 1–6.
 */
export function yearOfStudy(profile: CvProfileMasked, refDate: Date): number | null {
  const texts = [profile.summary, ...profile.education.flatMap((entry) => [entry.degree, entry.major, entry.institution])];
  for (const text of texts) {
    const year = statedYear(text);
    if (year !== null) return year;
  }

  const refMonth = refMonthOf(refDate);
  const starts = profile.education
    .map((entry) => ongoingStart(entry, refMonth))
    .filter((start): start is MonthIndex => start !== null);
  if (starts.length === 0) return null;
  const year = schoolYearOf(refMonth) - Math.floor(Math.max(...starts) / 12) + 1;
  return Math.min(MAX_YEAR_OF_STUDY, Math.max(MIN_YEAR_OF_STUDY, year));
}
