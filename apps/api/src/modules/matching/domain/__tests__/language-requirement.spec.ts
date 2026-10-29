import { meetsLanguageRequirement, parseLanguageText } from '../language-requirement.js';

describe('GĐ3 language requirement read by code (US-3.1 AC-12, CONTEXT D41)', () => {
  it.each([
    ['Tiếng Anh (TOEIC 500)', ['EN'], [{ kind: 'TOEIC', level: 500 }]],
    ['English - IELTS 6,5', ['EN'], [{ kind: 'IELTS', level: 65 }]],
    ['IELTS 7.0', ['EN'], [{ kind: 'IELTS', level: 70 }]],
    ['TOEFL iBT 80', ['EN'], [{ kind: 'TOEFL_IBT', level: 80 }]],
    ['TOEIC Listening & Reading 785', ['EN'], [{ kind: 'TOEIC', level: 785 }]],
    ['Tiếng Nhật JLPT N3', ['JA'], [{ kind: 'JLPT', level: 3 }]],
    ['N1', ['JA'], [{ kind: 'JLPT', level: 5 }]],
    ['Tiếng Hàn TOPIK II cấp 4', ['KO'], [{ kind: 'TOPIK', level: 4 }]],
    ['HSK 5', ['ZH'], [{ kind: 'HSK', level: 5 }]],
    ['VSTEP B1', ['EN'], [{ kind: 'CEFR', level: 3 }]],
    ['Tiếng Anh bậc 4/6', ['EN'], [{ kind: 'CEFR', level: 4 }]],
    ['Tiếng Pháp C1', ['FR'], [{ kind: 'CEFR', level: 5 }]],
    ['Anh - giao tiếp tốt', ['EN'], []],
    ['Tiếng Anh hoặc tiếng Nhật', ['EN', 'JA'], []],
    // Glued, out-of-range numbers skipped, a keyword without a score still tells the language.
    ['HSK5', ['ZH'], [{ kind: 'HSK', level: 5 }]],
    ['TOEIC650đ', ['EN'], [{ kind: 'TOEIC', level: 650 }]],
    ['IELTS6.5', ['EN'], [{ kind: 'IELTS', level: 65 }]],
    ['TOEIC 4 kỹ năng 600', ['EN'], [{ kind: 'TOEIC', level: 600 }]],
    ['TOEIC (2023) 650', ['EN'], [{ kind: 'TOEIC', level: 650 }]],
    ['TOEFL ITP 500', ['EN'], [{ kind: 'TOEFL_ITP', level: 500 }]],
    ['TOEIC 4 kỹ năng', ['EN'], []],
    ['TOEIC hoặc TOEFL 80', ['EN'], [{ kind: 'TOEFL_IBT', level: 80 }]],
    // Languages outside the original six.
    ['Russian B2', ['RU'], [{ kind: 'CEFR', level: 4 }]],
    ['Tiếng Tây Ban Nha (B2)', ['ES'], [{ kind: 'CEFR', level: 4 }]],
    ['Tiếng Lào cơ bản', ['other:lào'], []],
  ])('GĐ3 reads %s', (text, languages, certificates) => {
    expect(parseLanguageText(text)).toEqual({ languages, certificates });
  });

  it('GĐ3 numbers out of a certificate scale are not scores', () => {
    // A year after the keyword, a TOEFL ITP score read as iBT, an IELTS quarter band.
    expect(parseLanguageText('TOEIC 2023').certificates).toEqual([]);
    expect(parseLanguageText('TOEFL 550').certificates).toEqual([]);
    expect(parseLanguageText('IELTS 6.25').certificates).toEqual([]);
  });

  it('GĐ3 "trung cấp" is a level, not Chinese', () => {
    expect(parseLanguageText('Trung cấp').languages).toEqual([]);
    expect(parseLanguageText('Tiếng Anh trung cấp').languages).toEqual(['EN']);
  });

  it('GĐ3 language requirement: same certificate type only, language name, unparsed text', () => {
    const toeic500 = 'Tiếng Anh (TOEIC 500)';
    expect(meetsLanguageRequirement(toeic500, ['Tiếng Anh TOEIC 650'])).toBe(true);
    expect(meetsLanguageRequirement(toeic500, ['Chứng chỉ TOEIC 500 - IIG'])).toBe(true);
    expect(meetsLanguageRequirement(toeic500, ['Tiếng Anh TOEIC 495'])).toBe(false);
    // No conversion between kinds (D41): a high IELTS does not meet a TOEIC requirement.
    expect(meetsLanguageRequirement(toeic500, ['IELTS 7.5'])).toBe(false);
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
});
