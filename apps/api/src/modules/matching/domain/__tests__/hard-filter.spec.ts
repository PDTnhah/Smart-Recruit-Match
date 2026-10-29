import { type HardFilterFacts, HardFilterFactsSchema, type JdHardConditions } from '@srm/shared';
import { checkHardFilters } from '../hard-filter.js';

const conditions = (change: Partial<JdHardConditions> = {}): JdHardConditions => ({
  majors: ['Công nghệ thông tin', 'Khoa học máy tính'],
  min_study_year: 3,
  min_gpa: 2.5,
  required_languages: ['Tiếng Anh (TOEIC 500)'],
  ...change,
});

const facts = (change: Partial<HardFilterFacts> = {}): HardFilterFacts => ({
  major: 'Công nghệ thông tin',
  yearOfStudy: 3,
  gpa4: 3.2,
  languageCertificates: ['Tiếng Anh TOEIC 650'],
  ...change,
});

const NONE: JdHardConditions = { majors: [], min_study_year: null, min_gpa: null, required_languages: [] };

describe('GĐ3 hard filter (FR-14, US-3.1, CONTEXT D41)', () => {
  it('GĐ3 hard filter: a student meeting every condition is eligible with no reason', () => {
    expect(checkHardFilters(facts(), conditions())).toEqual({ eligible: true, ineligibleReasons: [] });
    // Majors match ignoring case and surrounding spaces; minimums are inclusive.
    expect(checkHardFilters(facts({ major: '  khoa học MÁY TÍNH ', yearOfStudy: 3, gpa4: 2.5 }), conditions()).eligible).toBe(
      true,
    );
  });

  it('GĐ3 hard filter: each failed condition yields one reason code', () => {
    const result = checkHardFilters(
      facts({ major: 'Kế toán', yearOfStudy: 2, gpa4: 2.49, languageCertificates: ['Tiếng Anh TOEIC 450'] }),
      conditions({ required_languages: ['Tiếng Anh (TOEIC 500)', 'Tiếng Nhật N3'] }),
    );
    expect(result).toEqual({
      eligible: false,
      ineligibleReasons: [
        { code: 'MAJOR_NOT_ALLOWED', required: ['Công nghệ thông tin', 'Khoa học máy tính'], actual: 'Kế toán' },
        { code: 'YEAR_BELOW_MIN', required: 3, actual: 2 },
        { code: 'GPA_BELOW_MIN', required: 2.5, actual: 2.49 },
        { code: 'LANGUAGE_NOT_MET', required: 'Tiếng Anh (TOEIC 500)', actual: ['Tiếng Anh TOEIC 450'] },
        { code: 'LANGUAGE_NOT_MET', required: 'Tiếng Nhật N3', actual: ['Tiếng Anh TOEIC 450'] },
      ],
    });
  });

  it('GĐ3 hard filter: a major typed with decomposed accents (NFD) is the same major', () => {
    const major = 'Công nghệ thông tin'.normalize('NFD');
    expect(checkHardFilters(facts({ major }), conditions()).eligible).toBe(true);
  });

  it('GĐ3 hard filter: only the failed condition is reported', () => {
    expect(checkHardFilters(facts({ yearOfStudy: 1 }), conditions()).ineligibleReasons).toEqual([
      { code: 'YEAR_BELOW_MIN', required: 3, actual: 1 },
    ]);
  });

  it('GĐ3 hard filter: missing GPA and JD without conditions', () => {
    expect(checkHardFilters(facts({ gpa4: null }), conditions()).ineligibleReasons).toEqual([
      { code: 'GPA_MISSING', required: 2.5, actual: null },
    ]);
    expect(checkHardFilters(facts({ major: null, yearOfStudy: null }), conditions()).ineligibleReasons).toEqual([
      { code: 'MAJOR_MISSING', required: ['Công nghệ thông tin', 'Khoa học máy tính'], actual: null },
      { code: 'YEAR_MISSING', required: 3, actual: null },
    ]);
    const unknown: HardFilterFacts = { major: null, yearOfStudy: null, gpa4: null, languageCertificates: [] };
    expect(checkHardFilters(unknown, NONE)).toEqual({ eligible: true, ineligibleReasons: [] });
  });

  it('Invariant 9 GPA is compared ×100, not as floats', () => {
    // 0.1 + 0.2 is 0.30000000000000004 as a float.
    expect(checkHardFilters(facts({ gpa4: 0.1 + 0.2 }), { ...NONE, min_gpa: 0.3 }).eligible).toBe(true);
  });

  it('BR-03 hard filter facts reject sensitive fields (strict schema)', () => {
    expect(HardFilterFactsSchema.safeParse(facts()).success).toBe(true);
    for (const field of ['gender', 'date_of_birth', 'photo', 'hometown', 'religion', 'marital_status']) {
      const result = HardFilterFactsSchema.safeParse({ ...facts(), [field]: 'x' });
      expect(result.success).toBe(false);
    }
    expect(Object.keys(HardFilterFactsSchema.shape).sort()).toEqual(['gpa4', 'languageCertificates', 'major', 'yearOfStudy']);
  });

  it('D41 hard filter facts use the 4-point GPA scale', () => {
    expect(HardFilterFactsSchema.safeParse(facts({ gpa4: 4 })).success).toBe(true);
    expect(HardFilterFactsSchema.safeParse(facts({ gpa4: 8.5 })).success).toBe(false);
    expect(HardFilterFactsSchema.safeParse(facts({ yearOfStudy: 0 })).success).toBe(false);
  });
});
