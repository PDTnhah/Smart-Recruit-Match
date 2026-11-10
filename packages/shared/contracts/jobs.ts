import { z } from 'zod';
import { EssayGradeJobSchema } from './essay-grade.js';
import { SKILL_NORMALIZE_BATCH } from './skills.js';

/**
 * Job types handled by the AI Service. Each later agent story adds its own type, payload schema,
 * queue and result output (US-3.2, US-4.1, …).
 */
export const AI_JOB_TYPES = [
  'CV_PARSE',
  'JD_ANALYZE',
  'SKILL_NORMALIZE',
  'MATCH',
  'QUESTIONS_GENERATE',
  'ESSAY_GRADE',
] as const;

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

/** Payload on `ai.skills.normalize` (US-2.5 AC-6): new skills to suggest a name and group for. */
export const SkillNormalizeJobSchema = z
  .strictObject({
    job_id: jobId(),
    skill_ids: z
      .array(rowId())
      .min(1)
      .max(SKILL_NORMALIZE_BATCH)
      .describe('core.skills.id of new skills awaiting review; skills reviewed meanwhile are skipped'),
  })
  .meta({ title: 'SkillNormalizeJob', description: 'Job on ai.skills.normalize: suggest names and groups for new skills' });

export type SkillNormalizeJob = z.infer<typeof SkillNormalizeJobSchema>;

/** Most pairs one matching run sends to the LLM: 1 000 students × top-M 50; NFR-7 plans for 500 × 10. */
export const MATCH_RUN_MAX_PAIRS = 50_000;

/** A versioned prompt such as `matching/v1`, or the code rules a verdict rests on. Shape only (LESSONS §32). */
const versionLabel = () => z.string().trim().min(1).max(200);

/** One CV × JD pair, by IDs and versions only (AD-5); the AI Service reads the pair's data from the views. */
export const MatchPairRefSchema = z
  .strictObject({
    cv_id: rowId().describe('core.cvs.id; each CV version has its own row'),
    cv_version: rowId().describe('core.cvs.version of that row'),
    jd_id: rowId().describe('core.job_descriptions.id'),
    jd_version: rowId().describe('core.job_descriptions.version the code part was computed for'),
  })
  .meta({ title: 'MatchPairRef', description: 'One CV × JD pair of a matching run' });

export type MatchPairRef = z.infer<typeof MatchPairRefSchema>;

/**
 * Payload on `ai.match.run` (US-3.2 AC-1, CONTEXT D46): the pairs among the top M of each CV that
 * still need the Matching Agent. Code has stored each pair's verdicts in `core.match_results`; the
 * AI Service reads them through `core.v_ai_match_pairs`.
 */
export const MatchRunJobSchema = z
  .strictObject({
    job_id: jobId(),
    campaign_id: rowId().describe('core.campaigns.id of the run'),
    rules_version: versionLabel().describe('Code rules the stored verdicts rest on, the same for every pair'),
    prompt_version: versionLabel()
      .nullable()
      .describe('Prompt the campaign is pinned to, e.g. matching/v1; null until it has a result, then the active one'),
    pairs: z.array(MatchPairRefSchema).min(1).max(MATCH_RUN_MAX_PAIRS).describe('Pairs to score, without duplicates'),
  })
  .meta({ title: 'MatchRunJob', description: 'Job on ai.match.run: score projects and comment on CV × JD pairs' });

export type MatchRunJob = z.infer<typeof MatchRunJobSchema>;

/**
 * Payload on `ai.questions.generate` (US-4.1 AC-4, CONTEXT D49): fill the question bank of one JD
 * up to its blueprint. The AI Service reads the blueprint and the requirements from
 * `core.v_ai_question_banks` and `core.v_ai_jd_requirements`.
 */
export const QuestionsGenerateJobSchema = z
  .strictObject({
    job_id: jobId(),
    bank_id: rowId().describe('core.question_banks.id; a locked bank is no longer generated for'),
  })
  .meta({ title: 'QuestionsGenerateJob', description: 'Job on ai.questions.generate: draft the missing questions of a bank' });

export type QuestionsGenerateJob = z.infer<typeof QuestionsGenerateJobSchema>;

export const AI_JOB_SCHEMAS = {
  CV_PARSE: CvParseJobSchema,
  JD_ANALYZE: JdAnalyzeJobSchema,
  SKILL_NORMALIZE: SkillNormalizeJobSchema,
  MATCH: MatchRunJobSchema,
  QUESTIONS_GENERATE: QuestionsGenerateJobSchema,
  ESSAY_GRADE: EssayGradeJobSchema,
} as const satisfies Record<AiJobType, z.ZodType>;

export type AiJobPayload<T extends AiJobType> = z.infer<(typeof AI_JOB_SCHEMAS)[T]>;

/** What a caller passes to dispatch: the payload without `job_id`, which the gateway generates. */
export type AiJobInput<T extends AiJobType> = Omit<AiJobPayload<T>, 'job_id'>;
