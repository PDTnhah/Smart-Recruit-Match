import type { CvProfileMasked, HardFilterFacts } from '@srm/shared';
import { yearOfStudy } from './year-of-study.js';

// What the hard filter and S_cv read about one student (US-3.1, US-3.2, CONTEXT D41, D46): the major
// and GPA of the school record, the year of study and the languages of the confirmed profile. Nothing
// else, so photo, gender, birth date, hometown, religion and marital status never reach a score (BR-03).

/** The school record of a student (`core.students`), read through StudentService. */
export interface StudentRecord {
  major: string | null;
  /** On the 4-point scale (CONTEXT D41). */
  gpa4: number | null;
}

/**
 * Each language with its level and each certificate name of the profile, as written: the entries
 * the language rules of US-3.6 read ("Tiếng Anh TOEIC 650", "JLPT N3").
 */
export function languageEntriesOf(profile: CvProfileMasked): string[] {
  return [
    ...profile.languages.map(({ language, level }) => (level === null ? language : `${language} ${level}`)),
    ...profile.certificates.map((certificate) => certificate.name),
  ];
}

/** `refDate` is `intake_end` of the campaign. */
export function hardFilterFacts(student: StudentRecord, profile: CvProfileMasked, refDate: Date): HardFilterFacts {
  return {
    major: student.major,
    yearOfStudy: yearOfStudy(profile, refDate),
    gpa4: student.gpa4,
    languageCertificates: languageEntriesOf(profile),
  };
}
