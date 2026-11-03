import type { CvProfileMasked, CvSkill } from '@srm/shared';

type Project = CvProfileMasked['projects'][number];
type Experience = CvProfileMasked['experience'][number];
type Certificate = CvProfileMasked['certificates'][number];

/** A masked profile with nothing in it but `change`. */
export const profile = (change: Partial<CvProfileMasked> = {}): CvProfileMasked => ({
  summary: null,
  education: [],
  skills: [],
  projects: [],
  experience: [],
  languages: [],
  certificates: [],
  ...change,
});

/** A skills-list entry mapped to the catalogue skill `canonical`; `null` for a NEW skill. */
export const listed = (name: string, canonical: string | null = name): CvSkill => ({
  name,
  canonical_name: canonical,
  match: canonical === null ? 'NEW' : 'ALIAS',
});

export const project = (change: Partial<Project> = {}): Project => ({
  name: 'Dự án',
  role: null,
  description: null,
  technologies: [],
  start: null,
  end: null,
  ...change,
});

export const experience = (change: Partial<Experience> = {}): Experience => ({
  organization: 'Công ty ABC',
  position: null,
  description: null,
  start: null,
  end: null,
  ...change,
});

export const certificate = (name: string): Certificate => ({ name, issuer: null, year: null });
