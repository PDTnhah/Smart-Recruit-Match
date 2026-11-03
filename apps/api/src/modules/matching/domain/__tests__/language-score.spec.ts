import { MatchLanguageVerdictSchema, type MatchVerdict } from '@srm/shared';
import { type LanguageRequirements, scoreLanguage } from '../language-score.js';

const jd = (required: string[], preferred: string[] = []): LanguageRequirements => ({
  hard_conditions: { majors: [], min_study_year: null, min_gpa: null, required_languages: required },
  preferred_languages: preferred,
});

/** The verdict, checked against the contract first (Invariant 5: MET and PARTIAL quote the CV). */
function verdictOf(requirements: LanguageRequirements, entries: string[]): MatchVerdict | null {
  const result = scoreLanguage(requirements, entries);
  if (result === null) return null;
  expect(MatchLanguageVerdictSchema.parse(result)).toEqual(result);
  return result.verdict;
}

describe('GĐ3 FR-40 language criterion over required and preferred (US-3.6 AC-5, CONTEXT D45)', () => {
  it('AC-5 a JD without any language has no criterion', () => {
    expect(scoreLanguage(jd([]), ['IELTS 7.0'])).toBeNull();
  });

  it('AC-5 a met required language is MET, with the CV entry as evidence and CEFR levels shown', () => {
    expect(scoreLanguage(jd(['Tiếng Anh (TOEIC 550)']), ['IELTS 6.0', 'Tiếng Pháp giao tiếp'])).toEqual({
      verdict: 'MET',
      evidence: 'IELTS 6.0',
      required: 'TOEIC 550 (B1)',
      held: 'IELTS 6.0 (B2); Tiếng Pháp giao tiếp',
    });
    // An unmet required language (a pair the hard filter turned away) is NOT_MET.
    expect(scoreLanguage(jd(['IELTS 6.5']), ['TOEIC 600'])).toEqual({
      verdict: 'NOT_MET',
      evidence: null,
      required: 'IELTS 6.5 (B2)',
      held: 'TOEIC 600 (B1)',
    });
  });

  it('AC-5 preferred: met is MET; one CEFR level short, or a lower score of the same level, is PARTIAL', () => {
    expect(verdictOf(jd([], ['IELTS 6.5']), ['TOEIC 800'])).toBe('MET');
    expect(scoreLanguage(jd([], ['IELTS 6.5']), ['TOEIC 600'])).toMatchObject({
      verdict: 'PARTIAL',
      evidence: 'TOEIC 600',
      required: 'IELTS 6.5 (B2) (ưu tiên)',
    });
    expect(verdictOf(jd([], ['TOEIC 700']), ['TOEIC 600'])).toBe('PARTIAL');
    expect(verdictOf(jd([], ['IELTS 7.0']), ['TOEIC 600'])).toBe('NOT_MET');
  });

  it('AC-5 preferred: an entry naming the language without a certificate is PARTIAL; a certificate too low is not', () => {
    expect(scoreLanguage(jd([], ['JLPT N3']), ['Tiếng Nhật giao tiếp'])).toMatchObject({
      verdict: 'PARTIAL',
      evidence: 'Tiếng Nhật giao tiếp',
    });
    expect(verdictOf(jd([], ['IELTS 7.0']), ['TOEIC 300'])).toBe('NOT_MET');
    // Listing one more certificate never lowers the verdict.
    expect(scoreLanguage(jd([], ['IELTS 7.0']), ['Tiếng Anh giao tiếp', 'TOEIC 300'])).toMatchObject({
      verdict: 'PARTIAL',
      evidence: 'Tiếng Anh giao tiếp',
    });
    expect(verdictOf(jd([], ['IELTS 7.0']), ['Tiếng Pháp giao tiếp'])).toBe('NOT_MET');
    // A language named without a level: any entry in it meets it.
    expect(verdictOf(jd([], ['Tiếng Hàn']), ['TOPIK 2'])).toBe('MET');
    expect(verdictOf(jd([], ['Tiếng Hàn']), [])).toBe('NOT_MET');
  });

  it('AC-5 preferred JLPT, TOPIK, HSK: one step short on their own scale is PARTIAL', () => {
    expect(verdictOf(jd([], ['JLPT N3']), ['JLPT N4'])).toBe('PARTIAL');
    expect(verdictOf(jd([], ['JLPT N3']), ['JLPT N5'])).toBe('NOT_MET');
    expect(verdictOf(jd([], ['HSK 4']), ['HSK 3'])).toBe('PARTIAL');
    expect(verdictOf(jd([], ['TOPIK 4']), ['Tiếng Hàn B2'])).toBe('NOT_MET');
  });

  it('AC-5 parts joined by "và" take the lowest verdict of the parts', () => {
    expect(scoreLanguage(jd([], ['TOEIC 550 và JLPT N3']), ['TOEIC 600', 'JLPT N4'])).toMatchObject({
      verdict: 'PARTIAL',
      evidence: 'TOEIC 600; JLPT N4',
      required: 'TOEIC 550 (B1) và JLPT N3 (ưu tiên)',
    });
    expect(verdictOf(jd([], ['TOEIC 550 và JLPT N3']), ['TOEIC 600'])).toBe('NOT_MET');
  });

  it.each<[string, string[], string[], MatchVerdict]>([
    ['MET + NOT_MET: 0.5', ['TOEIC 500'], ['JLPT N3'], 'PARTIAL'],
    ['MET + PARTIAL: 0.75, the MET bound', ['TOEIC 500'], ['TOEIC 700'], 'MET'],
    ['MET + 2 NOT_MET: 0.33', ['TOEIC 500'], ['JLPT N3', 'HSK 4'], 'PARTIAL'],
    ['MET + 3 NOT_MET: 0.25, the PARTIAL bound', ['TOEIC 500'], ['JLPT N3', 'HSK 4', 'TOPIK 3'], 'PARTIAL'],
    ['MET + 4 NOT_MET: 0.2', ['TOEIC 500'], ['JLPT N3', 'HSK 4', 'TOPIK 3', 'Tiếng Pháp'], 'NOT_MET'],
    ['PARTIAL + NOT_MET: 0.25', [], ['TOEIC 700', 'JLPT N3'], 'PARTIAL'],
    ['two NOT_MET: 0', [], ['JLPT N3', 'HSK 4'], 'NOT_MET'],
  ])('AC-5 the average of the entries gives the verdict: %s', (_name, required, preferred, verdict) => {
    expect(verdictOf(jd(required, preferred), ['TOEIC 600'])).toBe(verdict);
  });

  it('AC-5 held is null without any entry; long lists stay within the contract', () => {
    expect(scoreLanguage(jd(['Tiếng Anh']), [])).toEqual({
      verdict: 'NOT_MET',
      evidence: null,
      required: 'Tiếng Anh',
      held: null,
    });
    const long = (i: number) => `Tiếng Anh ${'giao tiếp '.repeat(9)}${i}`.slice(0, 100);
    const many = Array.from({ length: 10 }, (_, i) => long(i));
    const entries = Array.from({ length: 50 }, (_, i) => `${long(i)} TOEIC 900`.slice(0, 200));
    expect(verdictOf(jd(many, many), entries)).toBe('MET');
  });

  it('AC-5 the same input gives the same result', () => {
    const requirements = jd(['Tiếng Anh (TOEIC 550)'], ['JLPT N3', 'Tiếng Hàn']);
    const entries = ['IELTS 6.0', 'JLPT N4'];
    expect(scoreLanguage(requirements, entries)).toEqual(scoreLanguage(requirements, entries));
  });
});
