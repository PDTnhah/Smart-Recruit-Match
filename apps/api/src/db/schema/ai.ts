import {
  AI_JOB_RUN_STATUSES,
  AI_JOB_TYPES,
  type AiJobRunStatus,
  type AiJobType,
  QUESTION_DIFFICULTIES,
  QUESTION_REJECT_REASONS,
  QUESTION_TYPES,
  QUESTION_VALIDATION_STATUSES,
  type QuestionDifficulty,
  type QuestionRejectReason,
  type QuestionType,
  type QuestionValidationStatus,
} from '@srm/shared';
import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, numeric, pgSchema, text, unique, uuid, vector } from 'drizzle-orm/pg-core';
import { id, inList, oneOf, ref, timestamptz } from './columns.js';

/**
 * Owned by the AI Service: job state, LLM call log, embeddings (ARCHITECTURE › Phân vùng schema).
 * Only the `ai_service` role writes here; the API's `api_service` role reads (AD-4, CONTEXT D33).
 * The tables are declared here because drizzle-kit is the project's only migration tool.
 */
export const ai = pgSchema('ai');

/**
 * One row per job_id: the AI Service claims a job here before running it, so a redelivered message
 * is not processed twice (AD-5). `attempts` counts runs; retries stop at 3 (NFR-10).
 */
export const aiJobs = ai.table(
  'jobs',
  {
    jobId: uuid('job_id').primaryKey(),
    type: text('type').$type<AiJobType>().notNull(),
    status: text('status').$type<AiJobRunStatus>().notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    finishedAt: timestamptz('finished_at'),
  },
  (t) => [
    oneOf('jobs_type_check', t.type, AI_JOB_TYPES),
    oneOf('jobs_status_check', t.status, AI_JOB_RUN_STATUSES),
    check('jobs_attempts_check', sql`${t.attempts} >= 0`),
    // Finished exactly when the job left PROCESSING.
    check('jobs_finished_at_check', sql`(${t.status} = 'PROCESSING') = (${t.finishedAt} is null)`),
  ],
);

// Written only by the AI Service; the values mirror ai-service/app/llm/types.py, and
// ai-service/tests/llm/test_llm_calls_table.py checks both sides against this table's migration.
export const LLM_PROVIDERS = ['GEMINI', 'ANTHROPIC', 'FIXTURE'] as const;
export const LLM_EFFORTS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const LLM_CALL_OUTCOMES = ['SUCCEEDED', 'INVALID_OUTPUT', 'TRUNCATED', 'REFUSED', 'API_ERROR'] as const;
export const LLM_STOP_REASONS = ['END_TURN', 'MAX_TOKENS', 'REFUSAL', 'OTHER'] as const;

/**
 * One row per LLM attempt: tokens, cost, latency, and what produced the answer (NFR-11, US-2.2,
 * CONTEXT D34). The full request and reply live in the MinIO bucket `llm-logs` at `log_key`.
 * A call that failed at the provider has no reply, hence no stop reason.
 */
export const aiLlmCalls = ai.table(
  'llm_calls',
  {
    id: id(),
    jobId: uuid('job_id').references(() => aiJobs.jobId),
    agent: text('agent').notNull(),
    promptVersion: text('prompt_version').notNull(),
    provider: text('provider').$type<(typeof LLM_PROVIDERS)[number]>().notNull(),
    model: text('model').notNull(),
    effort: text('effort').$type<(typeof LLM_EFFORTS)[number]>().notNull(),
    attempt: integer('attempt').notNull(),
    outcome: text('outcome').$type<(typeof LLM_CALL_OUTCOMES)[number]>().notNull(),
    stopReason: text('stop_reason').$type<(typeof LLM_STOP_REASONS)[number]>(),
    rawStopReason: text('raw_stop_reason'),
    inputTokens: integer('input_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }),
    latencyMs: integer('latency_ms').notNull(),
    logKey: text('log_key').notNull().unique(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    // Added by US-3.2 (CONTEXT D46), so after created_at: the request was part of this batch.
    batchId: ref('batch_id').references(() => aiLlmBatches.id),
  },
  (t) => [
    index('llm_calls_agent_created_at_idx').on(t.agent, t.createdAt),
    index('llm_calls_batch_id_idx').on(t.batchId),
    index('llm_calls_job_id_idx').on(t.jobId),
    check('llm_calls_prompt_version_check', sql`${t.promptVersion} ~ '^[a-z][a-z0-9_]*/v[1-9][0-9]*$'`),
    oneOf('llm_calls_provider_check', t.provider, LLM_PROVIDERS),
    oneOf('llm_calls_effort_check', t.effort, LLM_EFFORTS),
    oneOf('llm_calls_outcome_check', t.outcome, LLM_CALL_OUTCOMES),
    oneOf('llm_calls_stop_reason_check', t.stopReason, LLM_STOP_REASONS),
    check('llm_calls_stop_reason_present_check', sql`(${t.outcome} = 'API_ERROR') = (${t.stopReason} is null)`),
    check('llm_calls_attempt_check', sql`${t.attempt} >= 1`),
    check(
      'llm_calls_tokens_check',
      sql`${t.inputTokens} >= 0 and ${t.cacheReadTokens} >= 0 and ${t.cacheWriteTokens} >= 0 and ${t.outputTokens} >= 0`,
    ),
    check('llm_calls_cost_usd_check', sql`${t.costUsd} >= 0`),
    check('llm_calls_latency_ms_check', sql`${t.latencyMs} >= 0`),
  ],
);

/** PREPARING: claimed, not yet accepted by the provider; SUBMITTED: the provider is running it. */
export const LLM_BATCH_STATUSES = ['PREPARING', 'SUBMITTED', 'PROCESSED', 'FAILED'] as const;

export type LlmBatchStatus = (typeof LLM_BATCH_STATUSES)[number];

/**
 * One provider batch of a job (US-3.2 AC-17, CONTEXT D46). The job handler inserts round 1 as
 * PREPARING before it submits, records the provider's id, then the worker acks the job message and
 * leaves `ai.jobs` PROCESSING: a batch may run for hours, longer than the broker waits for an ack.
 * A redelivered job finds its round 1 and submits nothing (AD-5). The poller of any replica leases
 * due rows with `FOR UPDATE SKIP LOCKED`, reads the results once the provider has ended the batch,
 * and submits the requests that failed again as round 2, then 3 (AC-9). A round larger than one
 * provider batch may hold (Gemini: 20 MB of inline requests) is split into parts.
 */
export const aiLlmBatches = ai.table(
  'llm_batches',
  {
    id: id(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => aiJobs.jobId),
    jobType: text('job_type').$type<AiJobType>().notNull(),
    /** The job message, so a poller on another replica or after a restart can finish the job. */
    jobPayload: jsonb('job_payload').$type<Record<string, unknown>>().notNull(),
    agent: text('agent').notNull(),
    promptVersion: text('prompt_version').notNull(),
    provider: text('provider').$type<(typeof LLM_PROVIDERS)[number]>().notNull(),
    model: text('model').notNull(),
    round: integer('round').notNull(),
    part: integer('part').notNull(),
    status: text('status').$type<LlmBatchStatus>().notNull(),
    providerBatchId: text('provider_batch_id'),
    requestCount: integer('request_count').notNull(),
    /** Requests of the round left without a valid answer, with why; written when it is processed. */
    failures: jsonb('failures').$type<Record<string, unknown>[]>(),
    errorMessage: text('error_message'),
    leaseOwner: text('lease_owner'),
    leaseUntil: timestamptz('lease_until'),
    nextPollAt: timestamptz('next_poll_at').notNull().defaultNow(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    submittedAt: timestamptz('submitted_at'),
    finishedAt: timestamptz('finished_at'),
  },
  (t) => [
    unique('llm_batches_job_round_part_key').on(t.jobId, t.round, t.part),
    unique('llm_batches_provider_batch_key').on(t.provider, t.providerBatchId),
    // The poller's scan: batches still open, by when they are due.
    index('llm_batches_due_idx')
      .on(t.nextPollAt)
      .where(sql`${t.status} in ('PREPARING', 'SUBMITTED')`),
    oneOf('llm_batches_job_type_check', t.jobType, AI_JOB_TYPES),
    oneOf('llm_batches_status_check', t.status, LLM_BATCH_STATUSES),
    oneOf('llm_batches_provider_check', t.provider, LLM_PROVIDERS),
    check('llm_batches_prompt_version_check', sql`${t.promptVersion} ~ '^[a-z][a-z0-9_]*/v[1-9][0-9]*$'`),
    check('llm_batches_round_check', sql`${t.round} between 1 and 3`),
    check('llm_batches_part_check', sql`${t.part} >= 1`),
    check('llm_batches_request_count_check', sql`${t.requestCount} > 0`),
    check(
      'llm_batches_provider_batch_id_check',
      sql`${t.status} = 'FAILED' or (${t.status} = 'PREPARING') = (${t.providerBatchId} is null)`,
    ),
    check('llm_batches_finished_check', sql`(${t.status} in ('PROCESSED', 'FAILED')) = (${t.finishedAt} is not null)`),
    check('llm_batches_error_check', sql`${t.status} <> 'FAILED' or ${t.errorMessage} is not null`),
  ],
);

/**
 * Questions the Test Generator accepted for a bank (US-4.1 AC-6–AC-8, CONTEXT D49), before the
 * Core Backend stores them in `core.questions` from the job result. `id` is the `owner_id` of the
 * question's vector in `ai.embeddings` (`owner_type = 'question'`). `stem_key` is the sha256 of the
 * stem in NFKC, lower-cased, whitespace collapsed (hashed so a long stem fits the B-tree index): the
 * same stem twice in a bank is refused here. `payload` holds the checked question as the result
 * sends it (`GeneratedQuestion` without `draft_id`, `model` and `prompt_version`).
 * `bank_id` points at `core.question_banks` without a foreign key: each service owns its schema.
 */
export const aiQuestionDrafts = ai.table(
  'question_drafts',
  {
    id: id(),
    bankId: ref('bank_id').notNull(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => aiJobs.jobId),
    type: text('type').$type<QuestionType>().notNull(),
    skill: text('skill').notNull(),
    skillKey: text('skill_key').notNull(),
    difficulty: text('difficulty').$type<QuestionDifficulty>().notNull(),
    stemKey: text('stem_key').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    // AC-8: a stem is drafted once per bank; this key also lists a bank's drafts.
    unique('question_drafts_bank_stem_key').on(t.bankId, t.stemKey),
    index('question_drafts_job_id_idx').on(t.jobId),
    oneOf('question_drafts_type_check', t.type, QUESTION_TYPES),
    oneOf('question_drafts_difficulty_check', t.difficulty, QUESTION_DIFFICULTIES),
    check('question_drafts_prompt_version_check', sql`${t.promptVersion} ~ '^[a-z][a-z0-9_]*/v[1-9][0-9]*$'`),
  ],
);

/**
 * The Validator's verdict on a draft (US-4.2 AC-5, CONTEXT D50): one row per draft, written once
 * (insert, on conflict do nothing) in the job that checked it. `status` and `reasons` are what code
 * decided from `verdict`, the model's answer as it came back, kept so a new threshold can be
 * measured without calling the model again (US-6.3 reads the rejection rate here).
 */
export const aiQuestionValidations = ai.table(
  'question_validations',
  {
    id: id(),
    draftId: ref('draft_id')
      .notNull()
      .unique('question_validations_draft_id_key')
      .references(() => aiQuestionDrafts.id),
    jobId: uuid('job_id')
      .notNull()
      .references(() => aiJobs.jobId),
    status: text('status').$type<QuestionValidationStatus>().notNull(),
    reasons: text('reasons').array().$type<QuestionRejectReason[]>().notNull(),
    verdict: jsonb('verdict').$type<Record<string, unknown>>().notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('question_validations_job_id_idx').on(t.jobId),
    oneOf('question_validations_status_check', t.status, QUESTION_VALIDATION_STATUSES),
    check('question_validations_reasons_check', sql`${t.reasons} <@ array[${inList(QUESTION_REJECT_REASONS)}]::text[]`),
    check(
      'question_validations_rejected_check',
      sql`(${t.status} = 'REJECTED') = (cardinality(${t.reasons}) > 0)`,
    ),
    check('question_validations_prompt_version_check', sql`${t.promptVersion} ~ '^[a-z][a-z0-9_]*/v[1-9][0-9]*$'`),
  ],
);

/** Owners of an embedding (US-2.5 AC-2). Lower case, as ARCHITECTURE › Các bảng chính names them. */
export const EMBEDDING_OWNER_TYPES = ['cv', 'jd', 'question', 'skill', 'essay'] as const;

export type EmbeddingOwnerType = (typeof EMBEDDING_OWNER_TYPES)[number];

/** BAAI/bge-m3 (AD-11); the fake `hashing-v1` embedder of compose uses the same size. */
export const EMBEDDING_DIMENSIONS = 1024;

const OWNER_TYPE = /^[a-z]+$/;

const ownerTypeLiteral = (type: string) => {
  if (!OWNER_TYPE.test(type)) throw new Error(`Refusing to inline owner type: ${type}`);
  return sql.raw(`'${type}'`);
};

/**
 * One vector per owner version and model (AD-11, US-2.5, CONTEXT D39), written by the AI Service
 * with an upsert on that key. `version` is the owner's version: cvs.version, skills.row_version, …
 * Each owner type has its own partial HNSW index: a nearest-skill search filtered on one shared
 * index would scan CV vectors first and could return too few rows.
 */
export const aiEmbeddings = ai.table(
  'embeddings',
  {
    id: id(),
    ownerType: text('owner_type').$type<EmbeddingOwnerType>().notNull(),
    ownerId: ref('owner_id').notNull(),
    version: integer('version').notNull(),
    model: text('model').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('embeddings_owner_key').on(t.ownerType, t.ownerId, t.version, t.model),
    check(
      'embeddings_owner_type_check',
      sql`${t.ownerType} in (${sql.join(EMBEDDING_OWNER_TYPES.map(ownerTypeLiteral), sql`, `)})`,
    ),
    check('embeddings_version_check', sql`${t.version} >= 0`),
    ...EMBEDDING_OWNER_TYPES.map((type) =>
      index(`embeddings_${type}_hnsw_idx`)
        .using('hnsw', t.embedding.op('vector_cosine_ops'))
        .where(sql`${t.ownerType} = ${ownerTypeLiteral(type)}`),
    ),
  ],
);
