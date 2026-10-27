import { z } from 'zod';
import { CvProfileSchema } from '../contracts/cv.js';
import { CV_STATES } from '../states/cv.js';
import { IdFieldSchema, RowVersionSchema } from './common.js';

// CV submission by students (FR-6, PRD GĐ2, US-1.6, CONTEXT D30). Every upload is a new `cvs` row
// with the next version; at most one row per student and campaign is active (BR-01). The student
// always comes from the access token, never from a request.

/**
 * `accept` of the CV file input. The MIME types let phone pickers offer documents; the API checks
 * the real content, not the name.
 */
export const CV_FILE_ACCEPT =
  '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Text fields of the multipart body of `POST /api/cvs` (the file itself is `file`). */
export const SubmitCvFieldsSchema = z.object({
  campaignId: IdFieldSchema('Chọn đợt thực tập'),
});

export const CvListQuerySchema = z.object({
  campaignId: z.coerce.number().int().positive().optional(),
});

export type CvListQuery = z.output<typeof CvListQuerySchema>;

export const CvSchema = z.object({
  id: z.number().int(),
  campaignId: z.number().int(),
  version: z.number().int(),
  status: z.enum(CV_STATES),
  /** The version that counts in its campaign (BR-01). */
  active: z.boolean(),
  /** Name of the uploaded file; download it through `GET /api/files/cv:{id}/url`. */
  fileName: z.string(),
  createdAt: z.iso.datetime(),
});

export type Cv = z.output<typeof CvSchema>;

/** Body of `GET /api/cvs/me`: the caller's CV versions, newest first. */
export const CvListSchema = z.object({ items: z.array(CvSchema) });

export type CvList = z.output<typeof CvListSchema>;

/**
 * `GET /api/cvs` for center staff (US-2.4 AC-11, CONTEXT D37): the version that counts of each
 * student. `attention=true` keeps the CVs staff must look at: analysis failed, or the file hid text.
 */
export const CenterCvListQuerySchema = z.object({
  campaignId: z.coerce.number().int().positive().optional(),
  /** A string, as query parameters are; `z.coerce.boolean` would read "false" as true. */
  attention: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CenterCvListQuery = z.output<typeof CenterCvListQuerySchema>;

export const CenterCvSchema = CvSchema.extend({
  studentId: z.number().int(),
  studentCode: z.string(),
  studentName: z.string(),
  /** The file hid text from the reader; removed before the analysis (AC-2, AC-3). */
  hiddenTextDetected: z.boolean(),
  /** Why the analysis failed, e.g. CV_NO_TEXT, LLM_REFUSED; null unless ANALYSIS_FAILED. */
  analysisErrorCode: z.string().nullable(),
});

export type CenterCv = z.output<typeof CenterCvSchema>;

/** Body of `GET /api/cvs`: newest first. */
export const CenterCvListSchema = z.object({ items: z.array(CenterCvSchema) });

export type CenterCvList = z.output<typeof CenterCvListSchema>;

// --- Profile review by the student (US-2.6, FR-11, BR-03, CONTEXT D40) ------------------------

/** Query of `GET /api/cvs/me/profile`: the campaign whose active CV the student reviews. */
export const CvProfileQuerySchema = z.object({
  campaignId: z.coerce.number().int().positive(),
});

export type CvProfileQuery = z.output<typeof CvProfileQuerySchema>;

/** Body of `GET /api/cvs/me/profile` and of the save, confirm and reopen calls. */
export const CvProfileViewSchema = z.object({
  cvId: z.number().int(),
  campaignId: z.number().int(),
  version: z.number().int(),
  status: z.enum(CV_STATES),
  rowVersion: z.number().int(),
  /** Name of the uploaded file; the screen shows it through `GET /api/files/cv:{id}/url`. */
  fileName: z.string(),
  /** The student's own profile, personal values included; null until the analysis succeeds. */
  profile: CvProfileSchema.nullable(),
  /** "Lưu nháp" and "Xác nhận" work now: awaiting confirmation, campaign still takes CVs (AC-8). */
  editable: z.boolean(),
  /** "Sửa lại" works now: confirmed, campaign still takes CVs (AC-12). */
  canReopen: z.boolean(),
});

export type CvProfileView = z.output<typeof CvProfileViewSchema>;

/**
 * Body of `PUT /api/cvs/me/profile` (draft) and `PUT /api/cvs/me/profile/confirm`. `cvId` is the
 * version on screen: a newer upload makes it stale rather than receiving this profile (AC-6). The
 * API maps the skills to the catalogue again; `canonical_name` and `match` sent are not trusted.
 */
export const SaveCvProfileRequestSchema = z.object({
  cvId: z.number().int().positive(),
  rowVersion: RowVersionSchema,
  profile: CvProfileSchema,
});

export type SaveCvProfileRequest = z.output<typeof SaveCvProfileRequestSchema>;

/** Body of `POST /api/cvs/me/profile/reopen` (AC-12). */
export const ReopenCvProfileRequestSchema = z.object({
  cvId: z.number().int().positive(),
  rowVersion: RowVersionSchema,
});

export type ReopenCvProfileRequest = z.output<typeof ReopenCvProfileRequestSchema>;

/** `value` with every blank string, nested in objects and arrays, turned into null. */
function blankToNull(value: unknown): unknown {
  if (typeof value === 'string') return value.trim() === '' ? null : value;
  if (Array.isArray(value)) return value.map(blankToNull);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, blankToNull(item)]));
  }
  return value;
}

/**
 * The profile form (AC-2): an input left blank means "none", then the same `CvProfile` rules as
 * the API, so a blank optional field is null and a blank required one gets its Vietnamese error.
 */
export const CvProfileFormSchema = z.preprocess(
  (value: z.input<typeof CvProfileSchema>) => blankToNull(value),
  CvProfileSchema,
);

export type CvProfileFormValues = z.input<typeof CvProfileFormSchema>;
