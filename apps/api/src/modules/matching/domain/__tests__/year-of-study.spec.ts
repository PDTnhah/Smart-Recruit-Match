import type { CvProfileMasked } from '@srm/shared';
import { checkHardFilters } from '../hard-filter.js';
import { hardFilterFacts, languageEntriesOf } from '../student-facts.js';
import { statedYear, yearOfStudy } from '../year-of-study.js';
import { certificate, profile } from './fixtures/profiles.js';

type Education = CvProfileMasked['education'][number];

const education = (change: Partial<Education> = {}): Education => ({
  institution: 'Trường Đại học Bách khoa',
  degree: null,
  major: 'Công nghệ thông tin',
  start: null,
  end: null,
  gpa: null,
  ...change,
});

/** `intake_end` of the campaign: 15/11/2025, Vietnam time; the school year 2025–2026. */
const INTAKE_END = new Date('2025-11-15T10:00:00+07:00');

const yearOf = (change: Partial<CvProfileMasked>) => yearOfStudy(profile(change), INTAKE_END);

describe('GĐ3 year of study from confirmed profile (US-3.2 AC-16, CONTEXT D46)', () => {
  it('GĐ3 "sinh viên năm N" in the summary, in figures or in words', () => {
    expect(yearOf({ summary: 'Tôi là sinh viên năm 3 ngành CNTT' })).toBe(3);
    expect(yearOf({ summary: 'Sinh viên năm thứ ba, yêu thích backend' })).toBe(3);
    expect(yearOf({ summary: 'SV năm tư' })).toBe(4);
    expect(yearOf({ summary: 'sinh  viên   năm nhất' })).toBe(1);
    expect(yearOf({ summary: 'Sinh viên năm thứ năm ngành kiến trúc' })).toBe(5);
    expect(yearOf({ summary: 'A third-year student of Computer Science' })).toBe(3);
  });

  it('GĐ3 "năm cuối" and a year number name no year of study', () => {
    expect(statedYear('Sinh viên năm cuối')).toBeNull();
    expect(statedYear('Final-year student')).toBeNull();
    expect(statedYear('Sinh viên năm 2024 đạt học bổng')).toBeNull();
    expect(statedYear('Sinh viên năm 7')).toBeNull();
    expect(statedYear(null)).toBeNull();
  });

  it('GĐ3 a stated year wins over the dates; an education entry may state it', () => {
    const ongoing = education({ start: '09/2022', end: 'Hiện tại' });
    expect(yearOf({ summary: 'Sinh viên năm 2', education: [ongoing] })).toBe(2);
    expect(yearOf({ education: [education({ degree: 'Kỹ sư (sinh viên năm 3)', start: '09/2020', end: 'hiện tại' })] })).toBe(
      3,
    );
  });

  it('GĐ3 the ongoing entry: school year holding intake_end − start year + 1', () => {
    expect(yearOf({ education: [education({ start: '09/2022', end: 'Hiện tại' })] })).toBe(4);
    expect(yearOf({ education: [education({ start: '2023', end: '2027' })] })).toBe(3);
    expect(yearOf({ education: [education({ start: '08/2025', end: 'dự kiến 06/2029' })] })).toBe(1);
    expect(yearOf({ education: [education({ start: '09/2024', end: null })] })).toBe(2);
    // Before September the school year is still the previous one.
    expect(yearOfStudy(profile({ education: [education({ start: '09/2022', end: 'nay' })] }), new Date('2025-08-20'))).toBe(3);
  });

  it('GĐ3 finished entries are skipped; of several ongoing ones the latest start counts', () => {
    const school = education({ institution: 'THPT A', start: '09/2017', end: '06/2020' });
    expect(yearOf({ education: [school] })).toBeNull();
    const second = education({ start: '09/2024', end: 'hiện tại' });
    expect(yearOf({ education: [school, education({ start: '09/2019', end: 'hiện tại' }), second] })).toBe(2);
  });

  it('GĐ3 the year is kept within 1..6', () => {
    expect(yearOf({ education: [education({ start: '09/2015', end: 'hiện tại' })] })).toBe(6);
    expect(yearOf({ education: [education({ start: '11/2025', end: 'hiện tại' })] })).toBe(1);
  });

  it('GĐ3 nothing readable: null, and a JD with a minimum year gives YEAR_MISSING', () => {
    expect(yearOf({})).toBeNull();
    expect(yearOf({ education: [education({ start: 'sắp tới', end: 'hiện tại' })] })).toBeNull();
    expect(yearOf({ education: [education({ start: '09/2026', end: 'hiện tại' })] })).toBeNull();
    const facts = hardFilterFacts({ major: 'CNTT', gpa4: 3.2 }, profile(), INTAKE_END);
    const conditions = { majors: [], min_study_year: 3, min_gpa: null, required_languages: [] };
    expect(checkHardFilters(facts, conditions).ineligibleReasons).toEqual([{ code: 'YEAR_MISSING', required: 3, actual: null }]);
  });
});

describe('BR-03 facts of the hard filter come from the school record and the masked profile', () => {
  it('BR-03 major and GPA from the record; languages and certificates as written', () => {
    const masked = profile({
      summary: 'Sinh viên năm 3',
      languages: [
        { language: 'Tiếng Anh', level: 'TOEIC 650' },
        { language: 'Tiếng Nhật', level: null },
      ],
      certificates: [certificate('AWS Cloud Practitioner')],
    });
    expect(languageEntriesOf(masked)).toEqual(['Tiếng Anh TOEIC 650', 'Tiếng Nhật', 'AWS Cloud Practitioner']);
    expect(hardFilterFacts({ major: 'CNTT', gpa4: 3.2 }, masked, INTAKE_END)).toEqual({
      major: 'CNTT',
      yearOfStudy: 3,
      gpa4: 3.2,
      languageCertificates: ['Tiếng Anh TOEIC 650', 'Tiếng Nhật', 'AWS Cloud Practitioner'],
    });
  });
});
