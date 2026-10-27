import { z } from 'zod';
import { CvPiiSchema, CvProfileSchema, CvSourceSchema } from './cv.js';
import { JdRequirementsSchema, PositionGroupSchema } from './jd.js';
import { CvParseJobSchema, JdAnalyzeJobSchema, SkillNormalizeJobSchema, type AiJobType } from './jobs.js';
import { SKILL_NORMALIZE_BATCH, SkillSuggestionSchema } from './skills.js';

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
    hidden_text_detected: z
      .boolean()
      .nullish()
      .describe('The input file had hidden text, removed before the prompt; null when not known (US-2.3 AC-12)'),
  })
  .meta({ title: 'AiJobError', description: 'Why a job failed' });

export type AiJobError = z.infer<typeof AiJobErrorSchema>;

/** Every LLM output is stored with the prompt and model that produced it (AGENTS › Invariant 12). */
const outputBase = {
  prompt_version: z.string().min(1).describe('Versioned prompt file, e.g. cv_parser/v3'),
  model: z.string().min(1).describe('Model id that produced the output'),
};

/** Names the catalogue does not have yet (US-2.5 AC-4); the backend queues them for ADMIN (FR-13). */
const newSkills = () =>
  z
    .array(z.string().trim().min(1).max(100))
    .max(100)
    .describe('Skill names not in the catalogue (match NEW), one per skillMatchKey, as written');

/**
 * Output of CV_PARSE (US-2.4 AC-8, CONTEXT D37). `pii` travels in clear over the broker and the
 * backend encrypts it before storing; the text the AI Service dropped as hidden is never part of
 * it, only the flag. `masked_text` is the CV's visible text with personal data replaced, kept for
 * the evidence check of US-3.2; null for a scan, which has no text layer.
 */
export const CvParseOutputSchema = z
  .strictObject({
    ...outputBase,
    cv_id: z.int().positive().describe('core.cvs.id of the parsed CV version'),
    cv_version: z.int().positive().describe('CV version that was parsed'),
    source: CvSourceSchema,
    profile: CvProfileSchema,
    pii: CvPiiSchema,
    // The profile with every personal value replaced by a token (BR-03); same shape, so same schema.
    profile_masked: CvProfileSchema,
    // Taken from profile_masked, without any name that holds a token: no personal data (BR-03).
    new_skills: newSkills(),
    masked_text: z
      .string()
      .min(1)
      .nullable()
      .describe('Visible CV text with personal data replaced; null for a scanned PDF'),
    hidden_text_detected: z.boolean().describe('The CV file contained hidden text, removed before the prompt'),
  })
  .meta({ title: 'CvParseOutput', description: 'Result of CV_PARSE' });

export type CvParseOutput = z.output<typeof CvParseOutputSchema>;

/**
 * Output of JD_ANALYZE (US-2.3 AC-3): the proposed requirements, which HR reviews and confirms. The
 * text the AI Service dropped as hidden is never part of it, only the flag (AC-12).
 */
export const JdAnalyzeOutputSchema = z
  .strictObject({
    ...outputBase,
    jd_id: z.int().positive().describe('core.job_descriptions.id the requirements belong to'),
    jd_version: z.int().positive().describe('JD version that was analysed'),
    // Skill names mapped to the catalogue are replaced by its canonical names (US-2.5).
    requirements: JdRequirementsSchema,
    position_group: PositionGroupSchema,
    new_skills: newSkills(),
    hidden_text_detected: z.boolean().describe('The JD file contained hidden text, removed before the prompt'),
  })
  .meta({ title: 'JdAnalyzeOutput', description: 'Result of JD_ANALYZE' });

/**
 * Output of SKILL_NORMALIZE (US-2.5 AC-6): suggestions for new skills awaiting review. ADMIN reads
 * them; nothing is approved from them (AD-2). A skill the LLM gave no valid suggestion for is left
 * out.
 */
export const SkillNormalizeOutputSchema = z
  .strictObject({
    ...outputBase,
    suggestions: z
      .array(SkillSuggestionSchema)
      .max(SKILL_NORMALIZE_BATCH)
      .describe('At most one suggestion per skill of the job'),
  })
  .meta({ title: 'SkillNormalizeOutput', description: 'Result of SKILL_NORMALIZE' });

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

export const SkillNormalizeResultSchema = resultMessage(
  'SKILL_NORMALIZE',
  SkillNormalizeJobSchema,
  SkillNormalizeOutputSchema,
).meta({
  title: 'SkillNormalizeResult',
  description: 'Message on ai.results for a SKILL_NORMALIZE job',
});

/**
 * A message on `ai.results`. The status/result/error checks live here only: `z.toJSONSchema` drops
 * refinements, so the AI Service builds the message in one place and tests it (CONTEXT D33).
 */
export const AiResultMessageSchema = z
  .discriminatedUnion('type', [CvParseResultSchema, JdAnalyzeResultSchema, SkillNormalizeResultSchema])
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
