import { AI_JOB_RUN_STATUSES, AI_JOB_TYPES, type AiJobRunStatus, type AiJobType } from '@srm/shared';
import { sql } from 'drizzle-orm';
import { check, index, integer, numeric, pgSchema, text, unique, uuid, vector } from 'drizzle-orm/pg-core';
import { id, oneOf, ref, timestamptz } from './columns.js';

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
  },
  (t) => [
    index('llm_calls_agent_created_at_idx').on(t.agent, t.createdAt),
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
