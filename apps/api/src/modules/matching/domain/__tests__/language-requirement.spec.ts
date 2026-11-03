import type { JdHardConditions } from '@srm/shared';
import { checkHardFilters } from '../hard-filter.js';
import { meetsLanguageRequirement } from '../language-requirement.js';

// The reader's own cases are in packages/shared/contracts/__tests__/languages.spec.ts.
describe('GĐ3 language requirement compared by code (US-3.1 AC-12, US-3.6, CONTEXT D41, D45)', () => {
  it('GĐ3 language requirement: certificate, language name, unparsed text', () => {
    const toeic500 = 'Tiếng Anh (TOEIC 500)';
    expect(meetsLanguageRequirement(toeic500, ['Tiếng Anh TOEIC 650'])).toBe(true);
    expect(meetsLanguageRequirement(toeic500, ['Chứng chỉ TOEIC 500 - IIG'])).toBe(true);
    expect(meetsLanguageRequirement(toeic500, ['Tiếng Anh TOEIC 495'])).toBe(false);
    // Another kind of the same language through CEFR (D45): IELTS 7.5 is C1, TOEIC 500 is A2.
    expect(meetsLanguageRequirement(toeic500, ['IELTS 7.5'])).toBe(true);
    expect(meetsLanguageRequirement(toeic500, ['Tiếng Anh'])).toBe(false);

    // Several certificates in one requirement are alternatives.
    expect(meetsLanguageRequirement('TOEIC 550 hoặc IELTS 5.5', ['IELTS 6.0'])).toBe(true);
    expect(meetsLanguageRequirement('JLPT N3', ['Tiếng Nhật N2'])).toBe(true);
    expect(meetsLanguageRequirement('JLPT N3', ['Tiếng Nhật N4'])).toBe(false);
    // CEFR levels of another language do not count.
    expect(meetsLanguageRequirement('Tiếng Pháp B2', ['Tiếng Anh B2'])).toBe(false);
    expect(meetsLanguageRequirement('Tiếng Pháp B2', ['Tiếng Pháp C1'])).toBe(true);

    // A language name only: any entry in that language.
    expect(meetsLanguageRequirement('Tiếng Anh giao tiếp', ['English - IELTS 6.0'])).toBe(true);
    expect(meetsLanguageRequirement('English', ['Anh văn'])).toBe(true);
    expect(meetsLanguageRequirement('Tiếng Nhật', ['Tiếng Anh TOEIC 900'])).toBe(false);

    // A language outside the table only matches itself.
    expect(meetsLanguageRequirement('Tiếng Lào', ['Tiếng Lào cơ bản'])).toBe(true);
    expect(meetsLanguageRequirement('Tiếng Lào', ['Tiếng Anh'])).toBe(false);
    expect(meetsLanguageRequirement('Tiếng Nga', ['Nga - giao tiếp'])).toBe(true);
    expect(meetsLanguageRequirement('Tiếng Tây Ban Nha', ['Spanish'])).toBe(true);

    // Neither: the entry must contain the requirement's words.
    expect(meetsLanguageRequirement('Ngoại ngữ thứ hai', ['Ngoại ngữ thứ hai: tiếng Pháp'])).toBe(true);
    expect(meetsLanguageRequirement('Ngoại ngữ thứ hai', ['Tiếng Pháp'])).toBe(false);
    expect(meetsLanguageRequirement('Tiếng Anh', [])).toBe(false);
  });

  it('GĐ3 a CEFR level of another language never meets the requirement', () => {
    expect(meetsLanguageRequirement('Tiếng Anh B1', ['Tiếng Nga B2'])).toBe(false);
    expect(meetsLanguageRequirement('Tiếng Nga B1', ['Tiếng Anh B2'])).toBe(false);
    expect(meetsLanguageRequirement('Tiếng Tây Ban Nha (B2)', ['English C1'])).toBe(false);
    expect(meetsLanguageRequirement('Tiếng Lào B1', ['Tiếng Thái B2'])).toBe(false);
    expect(meetsLanguageRequirement('Tiếng Anh B1', ['B2'])).toBe(true);
  });

  it('GĐ3 parts joined by "và" are all required, "hoặc" gives alternatives', () => {
    expect(meetsLanguageRequirement('Tiếng Anh và tiếng Nhật', ['Tiếng Anh'])).toBe(false);
    expect(meetsLanguageRequirement('Tiếng Anh và tiếng Nhật', ['Tiếng Anh', 'JLPT N3'])).toBe(true);
    expect(meetsLanguageRequirement('TOEIC 550 và JLPT N3', ['TOEIC 600'])).toBe(false);
    expect(meetsLanguageRequirement('TOEIC 550 và JLPT N3', ['TOEIC 600', 'Tiếng Nhật N2'])).toBe(true);
    // "và" inside one requirement that names a single language.
    expect(meetsLanguageRequirement('Tiếng Anh nghe và nói tốt', ['Tiếng Anh'])).toBe(true);
    expect(meetsLanguageRequirement('TOEIC Listening and Reading 600', ['TOEIC 650'])).toBe(true);
    expect(meetsLanguageRequirement('TOEIC hoặc TOEFL 80', ['TOEFL iBT 90'])).toBe(true);
    expect(meetsLanguageRequirement('HSK 4', ['Tiếng Trung HSK5'])).toBe(true);
  });

  it('GĐ3 decomposed Unicode (NFD) reads like NFC', () => {
    expect(meetsLanguageRequirement('Tiếng Nhật'.normalize('NFD'), ['tiếng nhật N3'])).toBe(true);
  });

  it('GĐ3 language requirement: cross-kind via CEFR, same kind by raw score (US-3.6 AC-2, AC-3)', () => {
    // The two examples of AC-2: IELTS 6.0 is B2 ≥ B1; TOEIC 600 is B1 < B2 (IELTS 6.5).
    expect(meetsLanguageRequirement('TOEIC 550', ['IELTS 6.0'])).toBe(true);
    expect(meetsLanguageRequirement('IELTS 6.5', ['TOEIC 600'])).toBe(false);
    // The same kind keeps its own score, even within one CEFR level (both B1).
    expect(meetsLanguageRequirement('TOEIC 700', ['TOEIC 650'])).toBe(false);
    // TOEFL iBT: the 1–6 band and the 0–120 scale compare as two kinds, through CEFR.
    expect(meetsLanguageRequirement('TOEFL iBT 80', ['TOEFL iBT 4.5'])).toBe(true);
    expect(meetsLanguageRequirement('TOEFL iBT 4', ['TOEFL iBT 72'])).toBe(true);
    expect(meetsLanguageRequirement('TOEFL iBT 100', ['TOEFL 4.5'])).toBe(false);
    expect(meetsLanguageRequirement('TOEFL ITP 543', ['IELTS 5.5'])).toBe(true);
    // VSTEP and CEFR levels are CEFR already.
    expect(meetsLanguageRequirement('Tiếng Anh bậc 3', ['TOEIC 550'])).toBe(true);
    expect(meetsLanguageRequirement('TOEIC 785', ['VSTEP B1'])).toBe(false);
    // Below the table of its kind: IELTS 3.5 has no level, TOEIC 300 is A2.
    expect(meetsLanguageRequirement('TOEIC 300', ['IELTS 3.5'])).toBe(false);
    // JLPT, TOPIK and HSK have no CEFR table: their own kind only.
    expect(meetsLanguageRequirement('JLPT N3', ['Tiếng Nhật B2'])).toBe(false);
    expect(meetsLanguageRequirement('Tiếng Nhật B1', ['JLPT N1'])).toBe(false);
    expect(meetsLanguageRequirement('TOPIK 3', ['Tiếng Hàn C1'])).toBe(false);
    // CEFR never crosses languages.
    expect(meetsLanguageRequirement('TOEIC 550', ['Tiếng Pháp C1'])).toBe(false);

    // AC-3: the hard filter keeps LANGUAGE_NOT_MET with what was required and what the student has.
    const conditions: JdHardConditions = { majors: [], min_study_year: null, min_gpa: null, required_languages: ['IELTS 6.5'] };
    const facts = { major: null, yearOfStudy: null, gpa4: null };
    expect(checkHardFilters({ ...facts, languageCertificates: ['TOEIC 600'] }, conditions)).toEqual({
      eligible: false,
      ineligibleReasons: [{ code: 'LANGUAGE_NOT_MET', required: 'IELTS 6.5', actual: ['TOEIC 600'] }],
    });
    expect(checkHardFilters({ ...facts, languageCertificates: ['TOEIC 800'] }, conditions).eligible).toBe(true);
  });

  it('GĐ3 another kind counts only when both sides name the language; a CEFR note on a score is no certificate (US-3.6 AC-2)', () => {
    // Entries that name no language: a driving licence class, a French test the reader does not know.
    expect(meetsLanguageRequirement('TOEIC 550', ['Giấy phép lái xe B2'])).toBe(false);
    expect(meetsLanguageRequirement('IELTS 6.0', ['DELF B2'])).toBe(false);
    // The same kind still compares when a side names no language; a named language crosses kinds.
    expect(meetsLanguageRequirement('CEFR B1', ['B2'])).toBe(true);
    expect(meetsLanguageRequirement('TOEIC 550', ['Tiếng Anh B2'])).toBe(true);
    // The table, not the note next to a score, gives its level, on either side.
    expect(meetsLanguageRequirement('TOEIC 700', ['TOEIC 650 (B1)'])).toBe(false);
    expect(meetsLanguageRequirement('IELTS 6.5 (tương đương B2)', ['IELTS 6.0'])).toBe(false);
    expect(meetsLanguageRequirement('IELTS 6.5 (B2)', ['TOEIC 800'])).toBe(true);
    expect(meetsLanguageRequirement('TOEIC 550 hoặc B2', ['Tiếng Anh B2'])).toBe(true);
  });
});
