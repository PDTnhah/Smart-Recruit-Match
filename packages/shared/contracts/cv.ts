import { z } from 'zod';
import { SkillMatchSchema } from './skills.js';

// Competence profile of a CV and its personal data, split apart (PRD GĐ2 step 3, FR-11, BR-03,
// US-2.4, CONTEXT D37). One definition for the LLM output of the CV Parser, the student's review
// screen (US-2.6) and the API (AD-6). `profile` never holds the personal section: that goes to
// `pii`, which the backend encrypts. `profile_masked` has the shape of `profile` with every
// personal value left in its free text replaced by a token such as [NAME]; code builds it, not the
// LLM, so the masking is deterministic and tested (pii-mask-cases.json). The LLM returns skill
// names only (`CvExtractedProfile`); the stored `CvProfile` maps each one to the skill catalogue
// (US-2.5, CONTEXT D39). Error messages are Vietnamese because the student's form displays them
// (US-2.6 AC-2); they do not reach the JSON Schema.

/** Where the profile was read from: the text of a PDF, the whole scanned PDF, or a DOCX. */
export const CV_SOURCES = ['TEXT_PDF', 'SCANNED_PDF', 'DOCX'] as const;

export type CvSource = (typeof CV_SOURCES)[number];

/** Recorded only in `pii`, never compared as text: masking "Nam" would break "Việt Nam" (D37). */
export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;

export const MARITAL_STATUSES = ['SINGLE', 'MARRIED', 'OTHER'] as const;

export const CvSourceSchema = z
  .enum(CV_SOURCES)
  .meta({ title: 'CvSource', description: 'TEXT_PDF = PDF with a text layer, SCANNED_PDF = PDF without one, DOCX' });

const text = (label: string, max: number) => {
  const empty = `${label} không được để trống`;
  return z
    .string({ error: empty })
    .trim()
    .min(1, { error: empty })
    .max(max, { error: `${label} tối đa ${max} ký tự` });
};

/** A date or period as the CV writes it ("09/2022", "2024", "hiện tại"); not parsed. */
const period = (label: string) => text(label, 40).nullable();

/** `noun` names the items in the error: "Tối đa 10 ngoại ngữ". */
const list = <T extends z.ZodType>(item: T, max: number, noun: string) =>
  z.array(item).max(max, { error: `Tối đa ${max} ${noun}` });

export const CvEducationSchema = z
  .strictObject({
    institution: text('Tên trường', 200).describe('School or university'),
    degree: text('Bậc học', 100).nullable().describe('Degree or programme level, e.g. "Kỹ sư", "Cử nhân"'),
    major: text('Ngành học', 200).nullable().describe('Major or field of study'),
    start: period('Thời gian bắt đầu').describe('Start as written'),
    end: period('Thời gian kết thúc').describe('End as written; "hiện tại" when ongoing'),
    gpa: text('GPA', 40).nullable().describe('GPA as written, with its scale, e.g. "3.2/4"'),
  })
  .meta({ title: 'CvEducation', description: 'One school or degree' });

/** Asked of the LLM: the name only. The fields and texts keep the keys of recorded fixtures. */
export const CvExtractedSkillSchema = z
  .strictObject({
    name: text('Tên kỹ năng', 100).describe('Skill name as the CV writes it; US-2.5 maps it to the skill catalogue'),
  })
  .meta({ title: 'CvExtractedSkill', description: 'One concrete skill the CV claims' });

/** A skill of the stored profile: the name as written and the catalogue skill it maps to. */
export const CvSkillSchema = z
  .strictObject({
    name: text('Tên kỹ năng', 100).describe('Skill name as the CV writes it'),
    canonical_name: text('Tên chuẩn của kỹ năng', 100)
      .nullable()
      .describe('Name of the catalogue skill it maps to; null when match is NEW'),
    match: SkillMatchSchema,
  })
  .refine((skill) => (skill.match === 'NEW') === (skill.canonical_name === null), {
    error: 'canonical_name is null exactly when match is NEW',
    path: ['canonical_name'],
  })
  .meta({ title: 'CvSkill', description: 'One concrete skill the CV claims, mapped to the skill catalogue' });

export type CvSkill = z.output<typeof CvSkillSchema>;

export const CvProjectSchema = z
  .strictObject({
    name: text('Tên dự án', 200).describe('Project name'),
    role: text('Vai trò', 200).nullable().describe("The student's role in the project"),
    description: text('Mô tả', 5000).nullable().describe('What the project does and what the student did, as written'),
    technologies: list(text('Công nghệ', 100), 30, 'công nghệ').describe('Languages, frameworks and tools the project used'),
    start: period('Thời gian bắt đầu').describe('Start as written'),
    end: period('Thời gian kết thúc').describe('End as written'),
  })
  .meta({ title: 'CvProject', description: 'One project, academic or personal' });

export const CvExperienceSchema = z
  .strictObject({
    organization: text('Tên công ty, tổ chức', 200).describe('Company or organisation'),
    position: text('Vị trí', 200).nullable().describe('Job title'),
    description: text('Mô tả', 5000).nullable().describe('Work done, as written'),
    start: period('Thời gian bắt đầu').describe('Start as written'),
    end: period('Thời gian kết thúc').describe('End as written; "hiện tại" when ongoing'),
  })
  .meta({ title: 'CvExperience', description: 'One job, internship or role in an organisation' });

export const CvLanguageSchema = z
  .strictObject({
    language: text('Ngoại ngữ', 100).describe('Language, e.g. "Tiếng Anh"'),
    level: text('Trình độ', 100).nullable().describe('Level or certificate as written, e.g. "TOEIC 650", "N3"'),
  })
  .meta({ title: 'CvLanguage', description: 'One foreign language' });

export const CvCertificateSchema = z
  .strictObject({
    name: text('Tên chứng chỉ', 200).describe('Certificate or award'),
    issuer: text('Đơn vị cấp', 200).nullable().describe('Who issued it'),
    year: text('Năm', 40).nullable().describe('When, as written'),
  })
  .meta({ title: 'CvCertificate', description: 'One certificate or award' });

/** Same fields for the LLM output and the stored profile; only the skill entries differ. */
const profileOf = <S extends z.ZodType>(skill: S) =>
  z.strictObject({
    summary: text('Giới thiệu', 3000).nullable().describe('Career objective or summary as written; no personal details'),
    education: list(CvEducationSchema, 10, 'mục học vấn').describe('Education, most recent first'),
    skills: list(skill, 100, 'kỹ năng').describe('Skills, one entry each'),
    projects: list(CvProjectSchema, 30, 'dự án').describe('Projects'),
    experience: list(CvExperienceSchema, 30, 'mục kinh nghiệm').describe('Work experience'),
    languages: list(CvLanguageSchema, 10, 'ngoại ngữ').describe('Foreign languages'),
    certificates: list(CvCertificateSchema, 30, 'chứng chỉ').describe('Certificates and awards'),
  });

export const CvExtractedProfileSchema = profileOf(CvExtractedSkillSchema).meta({
  title: 'CvExtractedProfile',
  description: 'Competence profile of a CV, without its personal section (FR-11)',
});

export type CvExtractedProfile = z.output<typeof CvExtractedProfileSchema>;

export const CvProfileSchema = profileOf(CvSkillSchema).meta({
  title: 'CvProfile',
  description: 'Competence profile of a CV, without its personal section; skills mapped to the catalogue (FR-11)',
});

export type CvProfile = z.output<typeof CvProfileSchema>;

/**
 * Same shape as `CvProfile`, every personal value replaced by a token (BR-03). Matching (US-3.2)
 * and the graders read only this, through core.v_ai_cv_profile_masked.
 */
export const CvProfileMaskedSchema = CvProfileSchema;

export type CvProfileMasked = CvProfile;

export const CvPiiSchema = z
  .strictObject({
    full_name: text('Họ tên', 200).nullable().describe("The student's full name"),
    emails: list(text('Email', 320), 10, 'email').describe('Email addresses'),
    phones: list(text('Số điện thoại', 40), 10, 'số điện thoại').describe('Phone numbers as written'),
    links: list(text('Liên kết', 500), 20, 'liên kết').describe('Personal links: GitHub, LinkedIn, portfolio, social profiles'),
    address: text('Địa chỉ', 500).nullable().describe('Postal address'),
    date_of_birth: text('Ngày sinh', 40).nullable().describe('Date of birth as written'),
    gender: z.enum(GENDERS).nullable().describe('Gender when the CV states it'),
    hometown: text('Quê quán', 200).nullable().describe('Hometown or place of origin ("quê quán")'),
    religion: text('Tôn giáo', 100).nullable().describe('Religion when the CV states it'),
    marital_status: z.enum(MARITAL_STATUSES).nullable().describe('Marital status when the CV states it'),
    has_photo: z.boolean().describe('The CV carries a photo of the student'),
  })
  .meta({ title: 'CvPii', description: 'Personal data of a CV; stored encrypted and never scored (BR-03)' });

export type CvPii = z.output<typeof CvPiiSchema>;

/** What the CV Parser asks the LLM for: the personal section and the profile, kept apart. */
export const CvExtractionSchema = z
  .strictObject({
    personal: CvPiiSchema,
    profile: CvExtractedProfileSchema,
  })
  .meta({ title: 'CvExtraction', description: 'Structured output of the CV Parser' });

export type CvExtraction = z.output<typeof CvExtractionSchema>;
