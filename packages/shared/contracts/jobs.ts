import { z } from 'zod';

/**
 * Job types handled by the AI Service. Each later agent story adds its own type, payload schema,
 * queue and result output (US-3.2, US-4.1, …).
 */
export const AI_JOB_TYPES = ['CV_PARSE', 'JD_ANALYZE'] as const;

export type AiJobType = (typeof AI_JOB_TYPES)[number];

const jobId = () =>
  z.uuid().describe('Unique id of this job; the AI Service processes each job_id once (AD-5)');

const rowId = () => z.int().positive();

/** Payload on `ai.cv.parse` (ARCHITECTURE › Hàng đợi). IDs only; the file is read from MinIO (AD-5). */
export const CvParseJobSchema = z
  .strictObject({
    job_id: jobId(),
    cv_id: rowId().describe('core.cvs.id of the CV version to parse'),
    cv_version: rowId().describe('core.cvs.version; results for an older version are ignored'),
    file_key: z.string().min(1).describe('Object key of the uploaded CV file'),
  })
  .meta({ title: 'CvParseJob', description: 'Job on ai.cv.parse: extract the profile of one CV version' });

export type CvParseJob = z.infer<typeof CvParseJobSchema>;

/** Payload on `ai.jd.analyze` (ARCHITECTURE › Hàng đợi). */
export const JdAnalyzeJobSchema = z
  .strictObject({
    job_id: jobId(),
    jd_id: rowId().describe('core.job_descriptions.id'),
    jd_version: rowId().describe('core.job_descriptions.version; results for an older version are ignored'),
  })
  .meta({ title: 'JdAnalyzeJob', description: 'Job on ai.jd.analyze: normalise the requirements of one JD version' });

export type JdAnalyzeJob = z.infer<typeof JdAnalyzeJobSchema>;

export const AI_JOB_SCHEMAS = {
  CV_PARSE: CvParseJobSchema,
  JD_ANALYZE: JdAnalyzeJobSchema,
} as const satisfies Record<AiJobType, z.ZodType>;

export type AiJobPayload<T extends AiJobType> = z.infer<(typeof AI_JOB_SCHEMAS)[T]>;

/** What a caller passes to dispatch: the payload without `job_id`, which the gateway generates. */
export type AiJobInput<T extends AiJobType> = Omit<AiJobPayload<T>, 'job_id'>;
