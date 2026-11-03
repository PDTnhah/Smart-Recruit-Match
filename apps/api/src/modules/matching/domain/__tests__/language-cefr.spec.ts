import { type Certificate, type CertificateKind, type LanguageId, parseLanguageText } from '@srm/shared';
import { cefrOf, formatCertificate, LANGUAGE_CEFR_VERSION, languageLabel } from '../language-cefr.js';

// The table of CONTEXT D45, written out again so that a change of the code's table shows here.
const TABLE: Readonly<Partial<Record<CertificateKind, { step: number; thresholds: (number | null)[] }>>> = {
  TOEIC: { step: 1, thresholds: [120, 225, 550, 785, 945, null] },
  IELTS: { step: 5, thresholds: [null, null, 40, 55, 70, 85] },
  TOEFL_IBT: { step: 1, thresholds: [0, 24, 44, 72, 95, 114] },
  TOEFL_IBT_BAND: { step: 5, thresholds: [10, 20, 30, 40, 50, 60] },
  TOEFL_ITP: { step: 1, thresholds: [null, 343, 433, 543, 627, null] },
  CEFR: { step: 1, thresholds: [1, 2, 3, 4, 5, 6] },
};

const BOUNDARIES = (Object.keys(TABLE) as CertificateKind[]).flatMap((kind) => {
  const { step, thresholds } = TABLE[kind]!;
  return thresholds.flatMap((min, index) => {
    if (min === null) return [];
    // The level a score one step lower falls to: the highest mapped level below, else 0.
    const below = thresholds.slice(0, index).reduce<number>((level, other, j) => (other === null ? level : j + 1), 0);
    return [[kind, min, index + 1, min - step, below] as const];
  });
});

describe('GĐ3 FR-40 CEFR conversion of certificates (US-3.6 AC-1, CONTEXT D45)', () => {
  it('FR-40 the table is language-cefr/v1', () => {
    expect(LANGUAGE_CEFR_VERSION).toBe('language-cefr/v1');
  });

  it.each(BOUNDARIES)('FR-40 CEFR thresholds at boundaries: %s %i is level %i, %i is level %i', (kind, at, level, under, below) => {
    expect(cefrOf({ kind, level: at })).toBe(level);
    if (under >= 0) expect(cefrOf({ kind, level: under })).toBe(below);
  });

  it('FR-40 the top of each scale stays at its highest level; JLPT, TOPIK, HSK have no table', () => {
    expect(cefrOf({ kind: 'TOEIC', level: 990 })).toBe(5);
    expect(cefrOf({ kind: 'IELTS', level: 90 })).toBe(6);
    expect(cefrOf({ kind: 'TOEFL_ITP', level: 677 })).toBe(5);
    expect(cefrOf({ kind: 'TOEFL_IBT_BAND', level: 55 })).toBe(5);
    for (const kind of ['JLPT', 'TOPIK', 'HSK'] as const) expect(cefrOf({ kind, level: 3 })).toBeNull();
  });

  it.each([
    ['IELTS 5.5', 4],
    ['IELTS 5.0', 3],
    ['TOEFL iBT 43', 2],
    ['TOEFL iBT 44', 3],
    ['TOEFL iBT 4.5', 4],
    ['TOEFL ITP 432', 2],
    ['TOEIC 945', 5],
    ['Tiếng Anh bậc 4/6', 4],
  ])('FR-40 %s as written in a CV is CEFR level %i', (text, level) => {
    const [certificate] = parseLanguageText(text).certificates;
    expect(cefrOf(certificate!)).toBe(level);
  });

  it.each<[Certificate, LanguageId | undefined, string]>([
    [{ kind: 'TOEIC', level: 550 }, undefined, 'TOEIC 550 (B1)'],
    [{ kind: 'TOEIC', level: 100 }, undefined, 'TOEIC 100 (dưới A1)'],
    [{ kind: 'IELTS', level: 60 }, undefined, 'IELTS 6.0 (B2)'],
    [{ kind: 'IELTS', level: 35 }, undefined, 'IELTS 3.5 (dưới B1)'],
    [{ kind: 'TOEFL_IBT', level: 114 }, undefined, 'TOEFL iBT 114 (C2)'],
    [{ kind: 'TOEFL_IBT_BAND', level: 45 }, undefined, 'TOEFL iBT 4.5 (B2)'],
    [{ kind: 'TOEFL_ITP', level: 300 }, undefined, 'TOEFL ITP 300 (dưới A2)'],
    [{ kind: 'JLPT', level: 3 }, 'JA', 'JLPT N3'],
    [{ kind: 'TOPIK', level: 4 }, 'KO', 'TOPIK 4'],
    [{ kind: 'HSK', level: 5 }, undefined, 'HSK 5'],
    [{ kind: 'CEFR', level: 4 }, 'FR', 'Tiếng Pháp B2'],
    [{ kind: 'CEFR', level: 3 }, undefined, 'CEFR B1'],
  ])('FR-40 shows %o as %s', (certificate, language, shown) => {
    expect(formatCertificate(certificate, language)).toBe(shown);
  });

  it('FR-40 a language outside the table is shown by its own word', () => {
    expect(languageLabel('other:lào')).toBe('Tiếng lào');
    expect(languageLabel('ES')).toBe('Tiếng Tây Ban Nha');
  });
});
