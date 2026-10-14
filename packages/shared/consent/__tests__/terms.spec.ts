import { CURRENT_TERMS, TERMS_V1 } from '../index.js';

// The SHA-256 of each version is pinned in apps/api (student/domain/terms.spec.ts), next to the hash
// function. These tests check that the text covers what NFR-2 and US-1.6 AC-1 require.

function text(): string {
  return TERMS_V1.sections.flatMap((section) => [section.heading, ...section.paragraphs]).join('\n');
}

describe('NFR-2: data-processing terms v1', () => {
  it('NFR-2: v1 is the current version', () => {
    expect(TERMS_V1.version).toBe(1);
    expect(CURRENT_TERMS).toBe(TERMS_V1);
  });

  it('NFR-2: every section has a heading and at least one paragraph', () => {
    expect(TERMS_V1.sections.length).toBeGreaterThan(0);
    for (const section of TERMS_V1.sections) {
      expect(section.heading.trim()).not.toBe('');
      expect(section.paragraphs.length).toBeGreaterThan(0);
      for (const paragraph of section.paragraphs) expect(paragraph.trim()).not.toBe('');
    }
  });

  it('NFR-2: names the LLM provider, its retention and its use of data for training (AC-1)', () => {
    expect(text()).toContain('Anthropic');
    expect(text()).toContain('30 ngày');
    expect(text()).toContain('huấn luyện');
  });

  it('NFR-2: says the CV is shared with companies the student is nominated to (AC-1)', () => {
    expect(text()).toContain('đề cử');
  });

  it('NFR-2: states the retention period of 12 months after the campaign closes (CONTEXT D30)', () => {
    expect(text()).toContain('12 tháng sau khi đợt thực tập đóng');
  });
});
