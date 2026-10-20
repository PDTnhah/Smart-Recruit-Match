import { z } from 'zod';
import { CvParseJobSchema, JdAnalyzeJobSchema, type AiJobType } from './jobs.js';

/** Outcome of a job as reported on `ai.results` (ARCHITECTURE › Hàng đợi). */
export const AI_RESULT_STATUSES = ['SUCCEEDED', 'PARTIAL', 'FAILED'] as const;

export type AiResultStatus = (typeof AI_RESULT_STATUSES)[number];

export const AiResultStatusSchema = z.enum(AI_RESULT_STATUSES).meta({
  title: 'AiResultStatus',
  description: 'SUCCEEDED and PARTIAL carry a result; FAILED carries an error',
});

/** States of an `ai.jobs` row: PROCESSING while a worker owns the job, then the result status. */
export const AI_JOB_RUN_STATUSES = ['PROCESSING', ...AI_RESULT_STATUSES] as const;

export type AiJobRunStatus = (typeof AI_JOB_RUN_STATUSES)[number];

export const AiJobErrorSchema = z
  .strictObject({
    code: z.string().min(1).describe('Machine-readable reason, e.g. RETRIES_EXHAUSTED or LLM_REFUSAL'),
    message: z.string().describe('Detail for logs and staff; not shown to students as is'),
    needs_human: z.boolean().describe('True when retrying cannot help and staff must handle the item'),
  })
  .meta({ title: 'AiJobError', description: 'Why a job failed' });

export type AiJobError = z.infer<typeof AiJobErrorSchema>;

/** Every LLM output is stored with the prompt and model that produced it (AGENTS › Invariant 12). */
const outputBase = {
  prompt_version: z.string().min(1).describe('Versioned prompt file, e.g. cv_parser/v3'),
  model: z.string().min(1).describe('Model id that produced the output'),
};

/** Output of CV_PARSE. US-2.4 adds the parsed profile, PII split and hidden-text flag. */
export const CvParseOutputSchema = z
  .strictObject({ ...outputBase })
  .meta({ title: 'CvParseOutput', description: 'Result of CV_PARSE' });

/** Output of JD_ANALYZE. US-2.3 adds the normalised requirements. */
export const JdAnalyzeOutputSchema = z
  .strictObject({ ...outputBase })
  .meta({ title: 'JdAnalyzeOutput', description: 'Result of JD_ANALYZE' });

/**
 * One result message per job type. `job` echoes the job payload so a FAILED result still tells the
 * backend which CV or JD it is about (CONTEXT D33).
 */
function resultMessage<T extends AiJobType, J extends z.ZodType, O extends z.ZodType>(type: T, job: J, output: O) {
  return z.strictObject({
    job_id: z.uuid(),
    type: z.literal(type),
    status: AiResultStatusSchema,
    job,
    result: output.nullable(),
    error: AiJobErrorSchema.nullable(),
  });
}

export const CvParseResultSchema = resultMessage('CV_PARSE', CvParseJobSchema, CvParseOutputSchema).meta({
  title: 'CvParseResult',
  description: 'Message on ai.results for a CV_PARSE job',
});

export const JdAnalyzeResultSchema = resultMessage('JD_ANALYZE', JdAnalyzeJobSchema, JdAnalyzeOutputSchema).meta({
  title: 'JdAnalyzeResult',
  description: 'Message on ai.results for a JD_ANALYZE job',
});

/**
 * A message on `ai.results`. The status/result/error checks live here only: `z.toJSONSchema` drops
 * refinements, so the AI Service builds the message in one place and tests it (CONTEXT D33).
 */
export const AiResultMessageSchema = z
  .discriminatedUnion('type', [CvParseResultSchema, JdAnalyzeResultSchema])
  .superRefine((msg, ctx) => {
    if (msg.job.job_id !== msg.job_id) {
      ctx.addIssue({ code: 'custom', path: ['job', 'job_id'], message: 'job.job_id must equal job_id' });
    }
    if (msg.status === 'FAILED') {
      if (msg.error === null) ctx.addIssue({ code: 'custom', path: ['error'], message: 'FAILED needs an error' });
      if (msg.result !== null) ctx.addIssue({ code: 'custom', path: ['result'], message: 'FAILED has no result' });
    } else {
      if (msg.result === null) ctx.addIssue({ code: 'custom', path: ['result'], message: `${msg.status} needs a result` });
      if (msg.status === 'SUCCEEDED' && msg.error !== null) {
        ctx.addIssue({ code: 'custom', path: ['error'], message: 'SUCCEEDED has no error' });
      }
    }
  })
  .meta({ title: 'AiResultMessage', description: 'Message on ai.results' });

export type AiResultMessage = z.infer<typeof AiResultMessageSchema>;

export type AiResultOf<T extends AiJobType> = Extract<AiResultMessage, { type: T }>;
