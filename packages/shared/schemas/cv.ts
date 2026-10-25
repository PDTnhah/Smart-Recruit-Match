import { z } from 'zod';
import { CV_STATES } from '../states/cv.js';
import { IdFieldSchema } from './common.js';

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
