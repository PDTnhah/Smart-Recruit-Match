import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// `CvProfileMasked` is an alias of `CvProfile`, so the type alone cannot stop a caller from passing
// the full profile; the domain must at least never name the full profile or the personal data.

const DOMAIN = join(__dirname, '..');

const sources = readdirSync(DOMAIN)
  .filter((file) => file.endsWith('.ts'))
  .sort()
  .map((file) => ({ file, text: readFileSync(join(DOMAIN, file), 'utf8') }));

const filesWhere = (test: (text: string) => boolean) => sources.filter(({ text }) => test(text)).map(({ file }) => file);

describe('BR-03 matching domain reads only the masked profile, without framework (US-3.5 AC-13)', () => {
  it('BR-03 no domain file names CvProfile or CvPii; the CV readers take CvProfileMasked', () => {
    expect(sources.length).toBeGreaterThan(0);
    expect(filesWhere((text) => /\bCvProfile\b|\bCvPii\b/.test(text))).toEqual([]);
    expect(filesWhere((text) => text.includes('CvProfileMasked'))).toEqual(['skill-evidence.ts', 'soft-skill-signals.ts']);
  });

  it('BR-03 no domain file imports NestJS or Drizzle (Invariant 13)', () => {
    expect(filesWhere((text) => /from '(?:@nestjs\/|drizzle-orm)/.test(text))).toEqual([]);
  });
});
