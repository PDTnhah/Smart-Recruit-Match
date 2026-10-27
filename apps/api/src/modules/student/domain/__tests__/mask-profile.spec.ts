import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type CvPii, type CvProfile, CvProfileSchema } from '@srm/shared';
import { findPii, fold, hasMaskToken, maskProfile, maskText, stringsOf } from '../mask-profile.js';

interface MaskCase {
  name: string;
  pii: CvPii;
  text: string;
  masked: string;
}

/** The cases ai-service/tests run against pii.py (US-2.4); both sides must give the same text. */
const CASES = (
  JSON.parse(
    readFileSync(join(__dirname, '../../../../../../../packages/shared/contracts/fixtures/pii-mask-cases.json'), 'utf8'),
  ) as { mask: MaskCase[] }
).mask;

const PII = CASES[0]!.pii;

describe('BR-03 masking a profile again after the student edits it (US-2.6 AC-5, CONTEXT D40)', () => {
  it.each(CASES)('BR-03 shared case: $name', ({ pii, text, masked }) => {
    expect(maskText(text, pii)).toBe(masked);
    expect(findPii(masked, pii)).toEqual([]);
  });

  it('BR-03 the shared cases are all there', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(13);
  });

  it('BR-03 decomposed diacritics and characters outside the BMP keep the offsets right', () => {
    const decomposed = 'Tôi là Nguyễn Văn An.'.normalize('NFD');
    expect(maskText(decomposed, PII)).toBe(`${'Tôi là '.normalize('NFD')}[NAME].`);
    expect(maskText('🎓 Nguyễn Văn An 🎓', PII)).toBe('🎓 [NAME] 🎓');
    expect(fold('Đặng').text).toBe('dang');
  });

  it('BR-03 every string of the profile is masked and the result is still a CvProfile', () => {
    const profile: CvProfile = {
      summary: 'Tôi là Nguyễn Văn An, sinh 15/03/2004, quê Nam Định.',
      education: [{ institution: 'Đại học Bách khoa', degree: null, major: 'CNTT', start: '2022', end: null, gpa: null }],
      skills: [
        { name: 'Java', canonical_name: 'Java', match: 'ALIAS' },
        { name: 'nguyenvanan-lib', canonical_name: null, match: 'NEW' },
      ],
      projects: [
        {
          name: 'Thư viện',
          role: null,
          description: 'Mã nguồn ở https://github.com/nguyenvanan/library, liên hệ 0912 345 678.',
          technologies: ['Java', 'PostgreSQL'],
          start: null,
          end: null,
        },
      ],
      experience: [
        { organization: 'Công ty A', position: null, description: 'Mail nguyenvanan.dev@gmail.com', start: null, end: null },
      ],
      languages: [{ language: 'Tiếng Anh', level: null }],
      certificates: [],
    };
    const masked = maskProfile(profile, PII);
    expect(CvProfileSchema.parse(masked)).toEqual(masked);
    expect(masked.summary).toBe('Tôi là [NAME], sinh [DOB], quê [HOMETOWN].');
    expect(masked.projects[0]!.description).toBe('Mã nguồn ở [LINK], liên hệ [PHONE].');
    expect(masked.experience[0]!.description).toBe('Mail [EMAIL]');
    expect(masked.skills).toEqual([
      { name: 'Java', canonical_name: 'Java', match: 'ALIAS' },
      { name: '[NAME]-lib', canonical_name: null, match: 'NEW' },
    ]);
    expect(stringsOf(masked).flatMap((text) => findPii(text, PII))).toEqual([]);
    expect(profile.summary).toContain('Nguyễn Văn An');
  });

  it('BR-03 a mask token is recognised, a bracketed word is not', () => {
    expect(hasMaskToken('[NAME]-lib')).toBe(true);
    expect(hasMaskToken('[EMAIL_1]')).toBe(true);
    expect(hasMaskToken('[js] array')).toBe(false);
  });
});
