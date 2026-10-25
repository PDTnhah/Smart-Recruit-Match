import { type ConsentTerms, CURRENT_TERMS, TERMS_V1, TERMS_V2 } from '../index.js';

// The SHA-256 of each version is pinned in apps/api (student/domain/terms.spec.ts), next to the hash
// function. These tests check that the text covers what NFR-2, US-1.6 AC-1 and US-2.4 require.

function text(terms: ConsentTerms): string {
  return terms.sections.flatMap((section) => [section.heading, ...section.paragraphs]).join('\n');
}

describe.each([
  ['v1', TERMS_V1],
  ['v2', TERMS_V2],
])('NFR-2: data-processing terms %s', (_name, terms) => {
  it('NFR-2: every section has a heading and at least one paragraph', () => {
    expect(terms.sections.length).toBeGreaterThan(0);
    for (const section of terms.sections) {
      expect(section.heading.trim()).not.toBe('');
      expect(section.paragraphs.length).toBeGreaterThan(0);
      for (const paragraph of section.paragraphs) expect(paragraph.trim()).not.toBe('');
    }
  });

  it('NFR-2: names Anthropic, its retention and its use of data for training (AC-1)', () => {
    expect(text(terms)).toContain('Anthropic');
    expect(text(terms)).toContain('30 ngày');
    expect(text(terms)).toContain('huấn luyện');
  });

  it('NFR-2: says the CV is shared with companies the student is nominated to (AC-1)', () => {
    expect(text(terms)).toContain('đề cử');
  });

  it('NFR-2: states the retention period of 12 months after the campaign closes (CONTEXT D30)', () => {
    expect(text(terms)).toContain('12 tháng sau khi đợt thực tập đóng');
  });
});

describe('NFR-2: terms v2 (US-2.4, CONTEXT D34, D37)', () => {
  it('NFR-2: v2 is the current version', () => {
    expect(TERMS_V2.version).toBe(2);
    expect(CURRENT_TERMS).toBe(TERMS_V2);
  });

  it('NFR-2: names Google, the paid tier of the Gemini API and its 55-day retention', () => {
    expect(text(TERMS_V2)).toContain('Gemini API của Google');
    expect(text(TERMS_V2)).toContain('gói trả phí');
    expect(text(TERMS_V2)).toContain('55 ngày');
  });

  it('BR-03: says personal data is kept apart, encrypted and never scored', () => {
    expect(text(TERMS_V2)).toContain('lưu có mã hóa');
    expect(text(TERMS_V2)).toContain('không được dùng trong bất kỳ bước chấm nào');
  });

  it('NFR-3: says a scan is sent whole, without masking', () => {
    expect(text(TERMS_V2)).toContain('không che trước được');
  });
});
