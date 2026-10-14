import { z } from 'zod';
import { JOB_DESCRIPTION_STATES } from '../states/job-description.js';
import { optionalText, RowVersionFieldSchema, RowVersionSchema } from './common.js';

// JD posting by HR and approval by the center (FR-4, FR-5, PRD GĐ1, US-1.5, CONTEXT D28). The web
// form and the API validate with these schemas. The company is never part of a request: the API
// takes it from the HR access token.

/** Work arrangement (FR-4). */
export const WORK_MODES = ['ONSITE', 'HYBRID', 'REMOTE'] as const;

export type WorkMode = (typeof WORK_MODES)[number];

/** Extensions the JD file input offers; the API checks the real content, not the name. */
export const JD_FILE_ACCEPT = '.pdf,.docx';

const requiredText = (empty: string, label: string, max: number) =>
  z
    .string({ error: empty })
    .trim()
    .min(1, { error: empty })
    .max(max, { error: `${label} tối đa ${max} ký tự` });

// Declared once: create requires them, the patch schema makes them optional.
const JD_FIELDS = {
  title: requiredText('Vui lòng nhập vị trí', 'Vị trí', 200),
  quota: z
    .number({ error: 'Chỉ tiêu phải là một số' })
    .int({ error: 'Chỉ tiêu phải là số nguyên' })
    .positive({ error: 'Chỉ tiêu phải lớn hơn 0' })
    .max(1000, { error: 'Chỉ tiêu tối đa 1000' }),
  location: requiredText('Vui lòng nhập địa điểm', 'Địa điểm', 300),
  workMode: z.enum(WORK_MODES, { error: 'Chọn hình thức làm việc' }),
  internshipPeriod: requiredText('Vui lòng nhập thời gian thực tập', 'Thời gian thực tập', 200),
  allowance: optionalText('Phụ cấp', 200),
  description: optionalText('Nội dung mô tả', 20_000),
};

/** Body of `POST /api/jds` (AC-4). A file, if any, follows with `PUT /api/jds/{id}/file`. */
export const CreateJdRequestSchema = z.object({
  campaignId: z.number({ error: 'Chọn đợt thực tập' }).int().positive({ error: 'Chọn đợt thực tập' }),
  ...JD_FIELDS,
});

export type CreateJdRequest = z.output<typeof CreateJdRequestSchema>;

/** Body of `PATCH /api/jds/{id}`: only the fields that change, while the JD is a draft (AC-6). */
export const UpdateJdRequestSchema = z.object({
  rowVersion: RowVersionSchema,
  ...z.object(JD_FIELDS).partial().shape,
});

export type UpdateJdRequest = z.output<typeof UpdateJdRequestSchema>;

/** Body of `POST /api/jds/{id}/submit` and `POST /api/jds/{id}/approve`. */
export const JdActionRequestSchema = z.object({ rowVersion: RowVersionSchema });

export type JdActionRequest = z.output<typeof JdActionRequestSchema>;

/** Text fields of the multipart body of `PUT /api/jds/{id}/file` (the file itself is `file`). */
export const UploadJdFileFieldsSchema = z.object({ rowVersion: RowVersionFieldSchema });

export const JdListQuerySchema = z.object({
  campaignId: z.coerce.number().int().positive().optional(),
  status: z.enum(JOB_DESCRIPTION_STATES).optional(),
});

export type JdListQuery = z.output<typeof JdListQuerySchema>;

export const JobDescriptionSchema = z.object({
  id: z.number().int(),
  campaignId: z.number().int(),
  companyId: z.number().int(),
  companyName: z.string(),
  title: z.string(),
  quota: z.number().int(),
  location: z.string().nullable(),
  workMode: z.enum(WORK_MODES).nullable(),
  internshipPeriod: z.string().nullable(),
  allowance: z.string().nullable(),
  description: z.string().nullable(),
  /** The original PDF/DOCX; download it through `GET /api/files/jd:{id}/url`. */
  file: z.object({ name: z.string() }).nullable(),
  status: z.enum(JOB_DESCRIPTION_STATES),
  version: z.number().int(),
  rowVersion: z.number().int(),
  /** Normalized requirements exist (US-2.3). Submitted without them, the JD awaits analysis. */
  requirementsReady: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type JobDescription = z.output<typeof JobDescriptionSchema>;

export const JdListSchema = z.object({ items: z.array(JobDescriptionSchema) });

export type JdList = z.output<typeof JdListSchema>;
