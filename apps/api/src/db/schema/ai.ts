import { AI_JOB_RUN_STATUSES, AI_JOB_TYPES, type AiJobRunStatus, type AiJobType } from '@srm/shared';
import { sql } from 'drizzle-orm';
import { check, integer, pgSchema, text, uuid } from 'drizzle-orm/pg-core';
import { oneOf, timestamptz } from './columns.js';

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
