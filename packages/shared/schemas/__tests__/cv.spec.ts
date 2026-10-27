import type { CvProfile } from '../../contracts/cv.js';
import { AcceptConsentRequestSchema } from '../consent.js';
import {
  CenterCvListQuerySchema,
  CvListQuerySchema,
  CvProfileFormSchema,
  CvProfileQuerySchema,
  ReopenCvProfileRequestSchema,
  SaveCvProfileRequestSchema,
  SubmitCvFieldsSchema,
} from '../cv.js';

describe('GĐ2: CV submission fields (FR-6)', () => {
  it('GĐ2: campaignId arrives as a multipart text field and becomes a number', () => {
    expect(SubmitCvFieldsSchema.parse({ campaignId: ' 42 ' })).toEqual({ campaignId: 42 });
  });

  it.each(['', '0', '-1', '1.5', 'abc', '12345678901'])('GĐ2: campaignId %p is rejected', (campaignId) => {
    expect(SubmitCvFieldsSchema.safeParse({ campaignId }).success).toBe(false);
  });

  it('GĐ2: a missing campaignId is rejected', () => {
    expect(SubmitCvFieldsSchema.safeParse({}).success).toBe(false);
  });

  it('GĐ2: the list query filters by campaign or not at all', () => {
    expect(CvListQuerySchema.parse({})).toEqual({});
    expect(CvListQuerySchema.parse({ campaignId: '7' })).toEqual({ campaignId: 7 });
    expect(CvListQuerySchema.safeParse({ campaignId: '0' }).success).toBe(false);
  });
});

describe('NFR-2: consent request', () => {
  it('NFR-2: names the campaign and the terms version read', () => {
    expect(AcceptConsentRequestSchema.parse({ campaignId: 3, termsVersion: 1 })).toEqual({
      campaignId: 3,
      termsVersion: 1,
    });
  });

  it.each([
    { campaignId: 0, termsVersion: 1 },
    { campaignId: 3, termsVersion: 0 },
    { campaignId: 3 },
    { termsVersion: 1 },
  ])('NFR-2: %p is rejected', (body) => {
    expect(AcceptConsentRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('GĐ2: center CV list query (US-2.4 AC-11)', () => {
  it('GĐ2: filters by campaign and attention, pages with defaults', () => {
    expect(CenterCvListQuerySchema.parse({})).toEqual({ limit: 100, offset: 0 });
    expect(CenterCvListQuerySchema.parse({ campaignId: '3', attention: 'true', limit: '20', offset: '40' })).toEqual({
      campaignId: 3,
      attention: 'true',
      limit: 20,
      offset: 40,
    });
  });

  it.each([{ attention: 'yes' }, { attention: '1' }, { limit: '0' }, { limit: '501' }, { offset: '-1' }])(
    'GĐ2: %p is rejected',
    (query) => {
      expect(CenterCvListQuerySchema.safeParse(query).success).toBe(false);
    },
  );
});

const profile = (): CvProfile => ({
  summary: 'Sinh viên năm 3 muốn thực tập Backend.',
  education: [{ institution: 'Đại học Bách khoa', degree: null, major: 'Khoa học máy tính', start: '09/2022', end: null, gpa: null }],
  skills: [
    { name: 'Java', canonical_name: 'Java', match: 'ALIAS' },
    { name: 'Rust embedded', canonical_name: null, match: 'NEW' },
  ],
  projects: [
    { name: 'Quản lý thư viện', role: null, description: 'REST API.', technologies: ['Java'], start: null, end: null },
  ],
  experience: [],
  languages: [{ language: 'Tiếng Anh', level: 'TOEIC 650' }],
  certificates: [],
});

/** Path and message of every issue, for comparing what the form shows next to each field. */
function issuesOf(value: unknown): Array<{ path: string; message: string }> {
  const result = CvProfileFormSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

describe('GĐ2: profile form of the student (US-2.6 AC-2, FR-11)', () => {
  it('GĐ2: blank optional inputs become null; the rest parses as CvProfile', () => {
    const input = {
      ...profile(),
      summary: '   ',
      education: [{ ...profile().education[0]!, degree: '', gpa: ' 3.2/4 ' }],
    };
    expect(CvProfileFormSchema.parse(input)).toEqual({
      ...profile(),
      summary: null,
      education: [{ ...profile().education[0]!, degree: null, gpa: '3.2/4' }],
    });
  });

  it('GĐ2: a blank required input gets its Vietnamese error at its own path', () => {
    const input = {
      ...profile(),
      education: [{ ...profile().education[0]!, institution: '' }],
      projects: [{ ...profile().projects[0]!, technologies: ['Java', ' '] }],
      languages: [{ language: '', level: null }],
    };
    expect(issuesOf(input)).toEqual([
      { path: 'education.0.institution', message: 'Tên trường không được để trống' },
      { path: 'projects.0.technologies.1', message: 'Công nghệ không được để trống' },
      { path: 'languages.0.language', message: 'Ngoại ngữ không được để trống' },
    ]);
  });

  it('GĐ2: too long a text and too many items are refused in Vietnamese', () => {
    const input = {
      ...profile(),
      summary: 'a'.repeat(3001),
      languages: Array.from({ length: 11 }, () => ({ language: 'Tiếng Anh', level: null })),
    };
    expect(issuesOf(input)).toEqual([
      { path: 'summary', message: 'Giới thiệu tối đa 3000 ký tự' },
      { path: 'languages', message: 'Tối đa 10 ngoại ngữ' },
    ]);
  });

  it('US-2.5: a skill typed outside the catalogue is NEW, without a canonical name', () => {
    const typed = { ...profile(), skills: [{ name: 'Rust embedded', canonical_name: null, match: 'NEW' }] };
    expect(CvProfileFormSchema.safeParse(typed).success).toBe(true);
    const forged = { ...profile(), skills: [{ name: 'Rust embedded', canonical_name: 'Rust', match: 'NEW' }] };
    expect(CvProfileFormSchema.safeParse(forged).success).toBe(false);
  });

  it('BR-03: the form has no field for personal data', () => {
    expect(CvProfileFormSchema.safeParse({ ...profile(), full_name: 'Trần Thị Mẫu' }).success).toBe(false);
  });

  it('GĐ2: no value at all is refused, not thrown (LESSONS §10)', () => {
    expect(CvProfileFormSchema.safeParse(undefined).success).toBe(false);
    expect(CvProfileFormSchema.safeParse(null).success).toBe(false);
  });
});

describe('GĐ2: profile review API (US-2.6 AC-4 to AC-6, AC-12)', () => {
  it('GĐ2: the query names the campaign', () => {
    expect(CvProfileQuerySchema.parse({ campaignId: '7' })).toEqual({ campaignId: 7 });
    expect(CvProfileQuerySchema.safeParse({}).success).toBe(false);
    expect(CvProfileQuerySchema.safeParse({ campaignId: '0' }).success).toBe(false);
  });

  it('GĐ2: a save names the CV version and the row_version read', () => {
    const body = { cvId: 4, rowVersion: 2, profile: profile() };
    expect(SaveCvProfileRequestSchema.parse(body)).toEqual(body);
    expect(SaveCvProfileRequestSchema.safeParse({ ...body, cvId: undefined }).success).toBe(false);
    expect(SaveCvProfileRequestSchema.safeParse({ ...body, rowVersion: -1 }).success).toBe(false);
  });

  it('GĐ2: the API does not turn blanks into null: the form does', () => {
    const body = { cvId: 4, rowVersion: 2, profile: { ...profile(), summary: '' } };
    expect(SaveCvProfileRequestSchema.safeParse(body).success).toBe(false);
  });

  it('GĐ2: reopening names the confirmed version and its row_version', () => {
    expect(ReopenCvProfileRequestSchema.parse({ cvId: 4, rowVersion: 3 })).toEqual({ cvId: 4, rowVersion: 3 });
    expect(ReopenCvProfileRequestSchema.safeParse({ cvId: 4 }).success).toBe(false);
  });
});
