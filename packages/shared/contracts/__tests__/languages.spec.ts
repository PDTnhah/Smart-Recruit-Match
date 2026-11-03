import { languagePartsOf, languageWordsOf, parseLanguageText } from '../../index.js';

describe('GĐ3 foreign languages read by code (US-3.1 AC-12, US-3.6, CONTEXT D41, D45)', () => {
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
    // A CEFR level after a score is a note on it, until another test, a language or "hoặc" (D45).
    ['TOEIC 650 (B1)', ['EN'], [{ kind: 'TOEIC', level: 650 }]],
    ['IELTS 6.5 tương đương B2', ['EN'], [{ kind: 'IELTS', level: 65 }]],
    ['JLPT N3 (B1)', ['JA'], [{ kind: 'JLPT', level: 3 }]],
    ['TOEIC 650, VSTEP B2', ['EN'], [{ kind: 'TOEIC', level: 650 }, { kind: 'CEFR', level: 4 }]],
    ['TOEIC 550 hoặc B2', ['EN'], [{ kind: 'TOEIC', level: 550 }, { kind: 'CEFR', level: 4 }]],
    ['IELTS 6.5, tiếng Pháp B2', ['EN', 'FR'], [{ kind: 'IELTS', level: 65 }, { kind: 'CEFR', level: 4 }]],
  ])('GĐ3 reads %s', (text, languages, certificates) => {
    expect(parseLanguageText(text)).toEqual({ languages, certificates });
  });

  it.each([
    ['TOEFL iBT 4.5', 45],
    ['TOEFL 6', 60],
    ['TOEFL iBT band 1', 10],
    ['TOEFL 3,5', 35],
  ])('D45 a TOEFL score up to 6 is a band of the 1–6 scale: %s', (text, level) => {
    expect(parseLanguageText(text).certificates).toEqual([{ kind: 'TOEFL_IBT_BAND', level }]);
  });

  it('D45 bands go in halves; larger TOEFL numbers stay on the 0–120 scale, ITP on its own', () => {
    expect(parseLanguageText('TOEFL iBT 4.3').certificates).toEqual([]);
    expect(parseLanguageText('TOEFL iBT 7').certificates).toEqual([{ kind: 'TOEFL_IBT', level: 7 }]);
    expect(parseLanguageText('TOEFL iBT 100 4 kỹ năng').certificates).toEqual([{ kind: 'TOEFL_IBT', level: 100 }]);
    expect(parseLanguageText('TOEFL ITP (2024) 500').certificates).toEqual([{ kind: 'TOEFL_ITP', level: 500 }]);
    expect(parseLanguageText('TOEFL ITP 4').certificates).toEqual([]);
  });

  it('GĐ3 numbers out of a certificate scale are not scores', () => {
    // A year after the keyword, a TOEFL ITP score read as iBT, an IELTS quarter band.
    expect(parseLanguageText('TOEIC 2023').certificates).toEqual([]);
    expect(parseLanguageText('TOEFL 550').certificates).toEqual([]);
    expect(parseLanguageText('IELTS 6.25').certificates).toEqual([]);
    expect(parseLanguageText('IELTS 6.3').certificates).toEqual([]);
  });

  it('GĐ3 "trung cấp" is a level, not Chinese; words of the object prototype are not names', () => {
    expect(parseLanguageText('Trung cấp').languages).toEqual([]);
    expect(parseLanguageText('Tiếng Anh trung cấp').languages).toEqual(['EN']);
    expect(parseLanguageText('constructor toString 650')).toEqual({ languages: [], certificates: [] });
  });

  it('GĐ3 parts joined by "và" when each names a language or a certificate, else one part', () => {
    expect(languagePartsOf('TOEIC 550 và JLPT N3')).toEqual([
      { languages: ['EN'], certificates: [{ kind: 'TOEIC', level: 550 }] },
      { languages: ['JA'], certificates: [{ kind: 'JLPT', level: 3 }] },
    ]);
    expect(languagePartsOf('Tiếng Anh nghe và nói tốt')).toEqual([{ languages: ['EN'], certificates: [] }]);
    expect(languagePartsOf('')).toEqual([{ languages: [], certificates: [] }]);
  });

  it('GĐ3 decomposed Unicode (NFD) reads like NFC', () => {
    expect(parseLanguageText('Tiếng Nhật'.normalize('NFD')).languages).toEqual(['JA']);
    expect(languageWordsOf('  Ngoại NGỮ   thứ hai'.normalize('NFD'))).toBe('ngoại ngữ thứ hai');
  });
});
