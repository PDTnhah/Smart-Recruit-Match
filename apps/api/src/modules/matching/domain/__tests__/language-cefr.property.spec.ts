import type { CertificateKind, MatchVerdict } from '@srm/shared';
import fc from 'fast-check';
import { cefrOf } from '../language-cefr.js';
import { certificateMeets, meetsLanguageRequirement } from '../language-requirement.js';
import { scoreLanguage } from '../language-score.js';
import { VERDICT_HALVES } from '../scv.js';

// English certificates as a CV writes them, on every valid score of their scale. TOEFL iBT on the
// 0–120 scale starts at 7: a TOEFL score up to 6 is a band of the 1–6 scale (CONTEXT D45).

interface Scale {
  kind: CertificateKind;
  /** Valid `level` values, in increasing order. */
  levels: readonly number[];
  text: (level: number) => string;
}

const range = (from: number, to: number, step = 1): number[] =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

const half = (level: number) => (level / 10).toFixed(1);

const SCALES: readonly Scale[] = [
  { kind: 'TOEIC', levels: range(10, 990, 5), text: (level) => `TOEIC ${level}` },
  { kind: 'IELTS', levels: range(0, 90, 5), text: (level) => `IELTS ${half(level)}` },
  { kind: 'TOEFL_IBT', levels: range(7, 120), text: (level) => `TOEFL iBT ${level}` },
  { kind: 'TOEFL_IBT_BAND', levels: range(10, 60, 5), text: (level) => `TOEFL iBT ${half(level)}` },
  { kind: 'TOEFL_ITP', levels: range(310, 677), text: (level) => `TOEFL ITP ${level}` },
  { kind: 'CEFR', levels: range(1, 6), text: (level) => `Tiếng Anh bậc ${level}` },
];

/** A scale and two of its levels, `low` ≤ `high`. */
const twoLevels = fc
  .constantFrom(...SCALES)
  .chain((scale) =>
    fc
      .tuple(fc.nat(scale.levels.length - 1), fc.nat(scale.levels.length - 1))
      .map(([a, b]) => ({ scale, low: scale.levels[Math.min(a, b)]!, high: scale.levels[Math.max(a, b)]! })),
  );

const oneCertificate = fc
  .constantFrom(...SCALES)
  .chain((scale) => fc.constantFrom(...scale.levels).map((level) => ({ scale, level })));

const anyCertificateText = oneCertificate.map(({ scale, level }) => scale.text(level));

/** CV entries: certificates, a language without one, notes, another language, no language at all. */
const anyEntry = fc.oneof(
  anyCertificateText,
  fc.constantFrom('Tiếng Anh giao tiếp', 'JLPT N3', 'Tiếng Pháp B2', 'TOEIC 650 (B1)', 'DELF B2'),
);

const jdOf = (required: string[], preferred: string[]) => ({
  hard_conditions: { majors: [], min_study_year: null, min_gpa: null, required_languages: required },
  preferred_languages: preferred,
});

const halvesOf = (verdict: MatchVerdict | undefined) => VERDICT_HALVES[verdict ?? 'NOT_MET'];

describe('GĐ3 FR-40 CEFR conversion properties (US-3.6 AC-10)', () => {
  it('AC-10 cefrOf never decreases as the score rises', () => {
    fc.assert(
      fc.property(twoLevels, ({ scale, low, high }) => {
        expect(cefrOf({ kind: scale.kind, level: low })!).toBeLessThanOrEqual(cefrOf({ kind: scale.kind, level: high })!);
      }),
    );
  });

  it('AC-10 a higher certificate of the same kind never fails where a lower one meets, of any kind wanted', () => {
    fc.assert(
      fc.property(twoLevels, oneCertificate, ({ scale, low, high }, wanted) => {
        const wantedCertificate = { kind: wanted.scale.kind, level: wanted.level };
        if (certificateMeets({ kind: scale.kind, level: low }, wantedCertificate)) {
          expect(certificateMeets({ kind: scale.kind, level: high }, wantedCertificate)).toBe(true);
        }
        // The same through the text a JD and a CV write.
        const requirement = wanted.scale.text(wanted.level);
        if (meetsLanguageRequirement(requirement, [scale.text(low)])) {
          expect(meetsLanguageRequirement(requirement, [scale.text(high)])).toBe(true);
        }
      }),
    );
  });

  it('AC-10 the same input gives the same result, whatever the order of the entries', () => {
    fc.assert(
      fc.property(
        fc.array(anyCertificateText, { maxLength: 3 }),
        fc.array(anyCertificateText, { maxLength: 3 }),
        fc.array(anyEntry, { maxLength: 5 }),
        (required, preferred, entries) => {
          const jd = jdOf(required, preferred);
          const result = scoreLanguage(jd, entries);
          expect(scoreLanguage(jd, entries)).toEqual(result);
          const reversed = scoreLanguage(jd, [...entries].reverse());
          expect(reversed?.verdict).toEqual(result?.verdict);
          expect(reversed?.required).toEqual(result?.required);
          for (const requirement of required) {
            expect(meetsLanguageRequirement(requirement, [...entries].reverse())).toBe(
              meetsLanguageRequirement(requirement, entries),
            );
          }
        },
      ),
    );
  });

  it('AC-10 one more CV entry never lowers a verdict, so hiding a weak certificate never pays', () => {
    fc.assert(
      fc.property(
        fc.array(anyCertificateText, { maxLength: 3 }),
        fc.array(anyCertificateText, { minLength: 1, maxLength: 3 }),
        fc.array(anyEntry, { maxLength: 4 }),
        anyEntry,
        (required, preferred, entries, extra) => {
          const jd = jdOf(required, preferred);
          const before = scoreLanguage(jd, entries)?.verdict;
          const after = scoreLanguage(jd, [...entries, extra])?.verdict;
          expect(halvesOf(after)).toBeGreaterThanOrEqual(halvesOf(before));
          for (const requirement of required) {
            if (meetsLanguageRequirement(requirement, entries)) {
              expect(meetsLanguageRequirement(requirement, [...entries, extra])).toBe(true);
            }
          }
        },
      ),
    );
  });
});
