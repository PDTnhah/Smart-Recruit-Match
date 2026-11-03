import type { Certificate, CertificateKind, LanguageId } from '@srm/shared';

// Certificates converted to CEFR levels, so that certificates of different kinds in one language
// compare (PRD › Quy đổi ngoại ngữ (CEFR), FR-40, US-3.6, CONTEXT D42, D45). Stored with every
// match result next to `MATCHING_RULES_VERSION`, since either one changes verdicts; a change of any
// threshold is a new version.

export const LANGUAGE_CEFR_VERSION = 'language-cefr/v1';

/** 1 (A1) to 6 (C2); 0 below the lowest level the table maps for the kind. */
export type CefrLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const CEFR_LABELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

/**
 * Lowest `level` (`Certificate`) of A1 to C2 for each kind with a table; null where the source maps
 * no score to that level. Sources read on 2026-11-03.
 */
const CEFR_THRESHOLDS: Readonly<Partial<Record<CertificateKind, readonly (number | null)[]>>> = {
  // ETS, Mapping the TOEIC tests on the CEFR (2025, #10823). ETS maps each section; a CV gives the
  // total, so the thresholds are Listening + Reading.
  TOEIC: [120, 225, 550, 785, 945, null],
  // ielts.org, IELTS and the CEFR: band × 10. C1 from 7.0 where the source puts it between 6.5 and 7.
  IELTS: [null, null, 40, 55, 70, 85],
  // ETS, A banded score scale for the TOEFL iBT test (04/2026), Tables 6 and 7: the 0–120 scale.
  TOEFL_IBT: [0, 24, 44, 72, 95, 114],
  // Same report, Table 7: band × 10 of the 1–6 scale; a half band stays at the level below.
  TOEFL_IBT_BAND: [10, 20, 30, 40, 50, 60],
  // ETS, Mapping the TOEFL ITP tests onto the CEFR (2023, MAR211). C1 627 as the text says; the
  // table says 620, the stricter one is kept.
  TOEFL_ITP: [null, 343, 433, 543, 627, null],
  // VSTEP bậc 1–6 and A1–C2 are read as CEFR already.
  CEFR: [1, 2, 3, 4, 5, 6],
};

/** The CEFR level of a certificate; null for a kind without a table (JLPT, TOPIK, HSK). */
export function cefrOf(certificate: Certificate): CefrLevel | null {
  const thresholds = CEFR_THRESHOLDS[certificate.kind];
  if (!thresholds) return null;
  let level = 0;
  thresholds.forEach((min, index) => {
    if (min !== null && certificate.level >= min) level = index + 1;
  });
  return level as CefrLevel;
}

/** "B2"; below the table, "dưới" its lowest level for the kind ("dưới B1" for IELTS). */
function cefrLabel(certificate: Certificate, level: CefrLevel): string {
  if (level > 0) return CEFR_LABELS[level - 1]!;
  const lowest = (CEFR_THRESHOLDS[certificate.kind] ?? []).findIndex((min) => min !== null);
  return `dưới ${CEFR_LABELS[Math.max(lowest, 0)]}`;
}

const LANGUAGE_LABELS: Readonly<Record<string, string>> = {
  EN: 'Tiếng Anh',
  JA: 'Tiếng Nhật',
  KO: 'Tiếng Hàn',
  ZH: 'Tiếng Trung',
  FR: 'Tiếng Pháp',
  DE: 'Tiếng Đức',
  RU: 'Tiếng Nga',
  ES: 'Tiếng Tây Ban Nha',
  IT: 'Tiếng Ý',
  TH: 'Tiếng Thái',
};

/** "Tiếng Anh"; a language outside the table by the word the text used ("Tiếng lào"). */
export function languageLabel(language: LanguageId): string {
  return LANGUAGE_LABELS[language] ?? `Tiếng ${language.replace(/^other:/, '')}`;
}

const half = (level: number): string => (level / 10).toFixed(1);

/**
 * A certificate as the match result shows it, with its CEFR level: "IELTS 6.0 (B2)", "TOEFL iBT
 * 4.5 (B2)", "JLPT N3". A CEFR or VSTEP level is shown with its language when the entry names one.
 */
export function formatCertificate(certificate: Certificate, language?: LanguageId): string {
  const { kind, level } = certificate;
  const withCefr = (score: string) => `${score} (${cefrLabel(certificate, cefrOf(certificate) ?? 0)})`;
  switch (kind) {
    case 'TOEIC':
      return withCefr(`TOEIC ${level}`);
    case 'IELTS':
      return withCefr(`IELTS ${half(level)}`);
    case 'TOEFL_IBT':
      return withCefr(`TOEFL iBT ${level}`);
    case 'TOEFL_IBT_BAND':
      return withCefr(`TOEFL iBT ${half(level)}`);
    case 'TOEFL_ITP':
      return withCefr(`TOEFL ITP ${level}`);
    case 'JLPT':
      return `JLPT N${6 - level}`;
    case 'TOPIK':
      return `TOPIK ${level}`;
    case 'HSK':
      return `HSK ${level}`;
    case 'CEFR':
      return `${language === undefined ? 'CEFR' : languageLabel(language)} ${CEFR_LABELS[level - 1]}`;
  }
}
