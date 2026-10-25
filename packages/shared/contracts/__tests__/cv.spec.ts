import {
  buildContractSchemas,
  CvExtractionSchema,
  CvParseOutputSchema,
  type CvPii,
  CvPiiSchema,
  type CvProfile,
  CvProfileSchema,
} from '../../index.js';

const profile = (): CvProfile => ({
  summary: 'Sinh viên năm 3 muốn thực tập Backend.',
  education: [
    {
      institution: 'Đại học Bách khoa',
      degree: 'Kỹ sư',
      major: 'Khoa học máy tính',
      start: '09/2022',
      end: null,
      gpa: '3.2/4',
    },
  ],
  skills: [{ name: 'Java' }, { name: 'Spring Boot' }],
  projects: [
    {
      name: 'Quản lý thư viện',
      role: 'Backend',
      description: 'REST API bằng Spring Boot.',
      technologies: ['Java', 'PostgreSQL'],
      start: '2024',
      end: '2024',
    },
  ],
  experience: [],
  languages: [{ language: 'Tiếng Anh', level: 'TOEIC 650' }],
  certificates: [{ name: 'AWS Cloud Practitioner', issuer: 'AWS', year: '2025' }],
});

const pii = (): CvPii => ({
  full_name: 'Trần Thị Mẫu',
  emails: ['mau.tran@example.com'],
  phones: ['0912 345 678'],
  links: ['https://github.com/mautran'],
  address: null,
  date_of_birth: '01/02/2004',
  gender: 'FEMALE',
  hometown: null,
  religion: null,
  marital_status: null,
  has_photo: false,
});

describe('FR-11 CvProfile and CvPii: one schema for the LLM, the review screen and the API (AD-6)', () => {
  it('GĐ2 a complete profile and personal section parse', () => {
    expect(CvProfileSchema.parse(profile())).toEqual(profile());
    expect(CvPiiSchema.parse(pii())).toEqual(pii());
    expect(CvExtractionSchema.parse({ personal: pii(), profile: profile() })).toBeTruthy();
  });

  it('BR-03 the profile has no field for personal data', () => {
    expect(CvProfileSchema.safeParse({ ...profile(), full_name: 'Trần Thị Mẫu' }).success).toBe(false);
    expect(CvProfileSchema.safeParse({ ...profile(), email: 'mau.tran@example.com' }).success).toBe(false);
  });

  it('BR-03 gender and marital status are codes, not free text', () => {
    expect(CvPiiSchema.safeParse({ ...pii(), gender: 'Nữ' }).success).toBe(false);
    expect(CvPiiSchema.safeParse({ ...pii(), marital_status: 'Độc thân' }).success).toBe(false);
  });

  it('GĐ2 texts are trimmed before their length is checked', () => {
    const blank = { ...profile(), skills: [{ name: '   ' }] };
    expect(CvProfileSchema.safeParse(blank).success).toBe(false);
    expect(CvProfileSchema.parse({ ...profile(), skills: [{ name: ' Java ' }] }).skills).toEqual([{ name: 'Java' }]);
  });

  it('AC-8 the CV_PARSE output carries the profile, the personal data, the masked copies and the source', () => {
    const output = {
      prompt_version: 'cv_parser/v1',
      model: 'gemini-3.8-flash',
      cv_id: 5,
      cv_version: 1,
      source: 'SCANNED_PDF',
      profile: profile(),
      pii: pii(),
      profile_masked: profile(),
      masked_text: null,
      hidden_text_detected: false,
    };
    expect(CvParseOutputSchema.parse(output)).toEqual(output);
    expect(CvParseOutputSchema.safeParse({ ...output, source: 'IMAGE' }).success).toBe(false);
    expect(CvParseOutputSchema.safeParse({ ...output, masked_text: '' }).success).toBe(false);
  });

  it('AD-6 the profile is one JSON Schema, referenced by the output', () => {
    const schemas = buildContractSchemas();
    const outputProperties = schemas.cv_parse_output?.properties as Record<string, unknown>;
    expect(outputProperties.profile).toEqual({ $ref: './cv_profile.json' });
    expect(outputProperties.profile_masked).toEqual({ $ref: './cv_profile.json' });
    expect(outputProperties.pii).toEqual({ $ref: './cv_pii.json' });
  });
});
