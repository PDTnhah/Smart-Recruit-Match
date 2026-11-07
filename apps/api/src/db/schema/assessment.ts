import {
  ACTOR_KINDS,
  type ActorKind,
  type ExamBlueprint,
  type MissingCell,
  QUESTION_BANK_STATES,
  QUESTION_DIFFICULTIES,
  QUESTION_GENERATION_RUN_STATUSES,
  QUESTION_STATES,
  QUESTION_TYPES,
  type QuestionAnswerKey,
  type QuestionBankStatus,
  type QuestionContent,
  type QuestionDifficulty,
  type QuestionGenerationRunStatus,
  type QuestionRubric,
  type QuestionStatus,
  type QuestionType,
  type QuestionValidation,
} from '@srm/shared';
import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, jsonb, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { campaigns } from './campaigns.js';
import { id, oneOf, ref, rowVersion, timestamptz, timestamps } from './columns.js';
import { core } from './core.js';
import { jobDescriptions } from './job-descriptions.js';
import { users } from './users.js';

/**
 * The question bank of a JD and its exam blueprint (BR-05, FR-18, US-4.1, CONTEXT D49). One bank
 * per JD (Q2, decided in part), made when the JD is approved; CENTER edits `blueprint` until the
 * bank is locked (US-4.2, D50). `jd_version` is the JD version the bank was made for. Once LOCKED,
 * a trigger keeps the bank and its questions as they are (migration 0031): only `version` rises,
 * by one per question retired.
 */
export const questionBanks = core.table(
  'question_banks',
  {
    id: id(),
    campaignId: ref('campaign_id')
      .notNull()
      .references(() => campaigns.id),
    jdId: ref('jd_id')
      .notNull()
      .unique('question_banks_jd_id_key')
      .references(() => jobDescriptions.id),
    jdVersion: integer('jd_version').notNull(),
    blueprint: jsonb('blueprint').$type<ExamBlueprint>().notNull(),
    status: text('status').$type<QuestionBankStatus>().notNull().default('OPEN'),
    /** Bank version: 1 when locked, one more per question retired after that (US-4.2 AC-7). */
    version: integer('version').notNull().default(1),
    /** Set with LOCKED, in the same UPDATE (`transitionTo` `set`). */
    lockedAt: timestamptz('locked_at'),
    rowVersion: rowVersion(),
    ...timestamps(),
  },
  (t) => [
    index('question_banks_campaign_id_idx').on(t.campaignId),
    check('question_banks_versions_check', sql`${t.jdVersion} > 0 and ${t.version} > 0`),
    oneOf('question_banks_status_check', t.status, QUESTION_BANK_STATES),
    check('question_banks_locked_check', sql`(${t.status} = 'LOCKED') = (${t.lockedAt} is not null)`),
  ],
);

/**
 * One row per `ai.questions.generate` job of a bank (US-4.1 AC-4, AC-9). A technical log like
 * `match_runs`: closed once by the result of its job. The job id is stored before the job is sent,
 * so even an answer that comes at once finds its run (LESSONS §33). At most one run per bank is
 * RUNNING (AGENTS › Invariant 11); a run whose result can no longer be expected is closed FAILED
 * with `STALE` by the next one.
 */
export const questionGenerationRuns = core.table(
  'question_generation_runs',
  {
    id: id(),
    bankId: ref('bank_id')
      .notNull()
      .references(() => questionBanks.id),
    jobId: uuid('job_id').notNull().unique('question_generation_runs_job_id_key'),
    /** When the broker took the job; null until the API has handed it over. */
    dispatchedAt: timestamptz('dispatched_at'),
    status: text('status').$type<QuestionGenerationRunStatus>().notNull(),
    actorKind: text('actor_kind').$type<ActorKind>().notNull(),
    actorId: ref('actor_id').references(() => users.id),
    /** Cells still short of drafts when the job ended; null while it runs or when it failed whole. */
    missingCells: jsonb('missing_cells').$type<MissingCell[]>(),
    /** Drafts of the result the bank did not hold yet. */
    questionsReceived: integer('questions_received').notNull().default(0),
    errorCode: text('error_code'),
    ...timestamps(),
    finishedAt: timestamptz('finished_at'),
  },
  (t) => [
    oneOf('question_generation_runs_status_check', t.status, QUESTION_GENERATION_RUN_STATUSES),
    oneOf('question_generation_runs_actor_kind_check', t.actorKind, ACTOR_KINDS),
    // AC-4: one running job per bank; a second request answers with the running one.
    uniqueIndex('question_generation_runs_bank_running_key')
      .on(t.bankId)
      .where(sql`${t.status} = 'RUNNING'`),
    index('question_generation_runs_bank_id_idx').on(t.bankId),
    check('question_generation_runs_finished_check', sql`(${t.status} = 'RUNNING') = (${t.finishedAt} is null)`),
    check('question_generation_runs_actor_check', sql`(${t.actorKind} = 'USER') = (${t.actorId} is not null)`),
    check('question_generation_runs_failed_check', sql`${t.status} <> 'FAILED' or ${t.errorCode} is not null`),
    check('question_generation_runs_received_check', sql`${t.questionsReceived} >= 0`),
  ],
);

/**
 * Questions of a bank (FR-18, US-4.1 AC-9). Written by the Core Backend from the drafts of the
 * Test Generator, each once by `draft_id` (`ai.question_drafts.id`), status DRAFT until the
 * Validator's verdict moves it, with `validation`, to VALIDATED or REJECTED (US-4.2 AC-5).
 * `content` is what a student may see; `answer_key` and `rubric` never leave the server for a
 * student (AGENTS › Invariant 8).
 */
export const questions = core.table(
  'questions',
  {
    id: id(),
    bankId: ref('bank_id')
      .notNull()
      .references(() => questionBanks.id),
    /** `ai.question_drafts.id`; no foreign key across the schemas the two services own (AD-4). */
    draftId: bigint('draft_id', { mode: 'number' }).notNull().unique('questions_draft_id_key'),
    type: text('type').$type<QuestionType>().notNull(),
    skill: text('skill').notNull(),
    difficulty: text('difficulty').$type<QuestionDifficulty>().notNull(),
    content: jsonb('content').$type<QuestionContent>().notNull(),
    answerKey: jsonb('answer_key').$type<QuestionAnswerKey>().notNull(),
    rubric: jsonb('rubric').$type<QuestionRubric>(),
    status: text('status').$type<QuestionStatus>().notNull().default('DRAFT'),
    /** The Validator's verdict with its model and prompt (Invariant 12); null while DRAFT. */
    validation: jsonb('validation').$type<QuestionValidation>(),
    version: integer('version').notNull().default(1),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    rowVersion: rowVersion(),
    ...timestamps(),
  },
  (t) => [
    // Coverage and the exam draw read a bank's questions by cell and status (US-4.3).
    index('questions_bank_cell_status_idx').on(t.bankId, t.skill, t.difficulty, t.status),
    oneOf('questions_type_check', t.type, QUESTION_TYPES),
    oneOf('questions_difficulty_check', t.difficulty, QUESTION_DIFFICULTIES),
    oneOf('questions_status_check', t.status, QUESTION_STATES),
    check('questions_validation_check', sql`(${t.status} = 'DRAFT') = (${t.validation} is null)`),
    // An essay is graded by its rubric; a multiple-choice question has none.
    check('questions_rubric_check', sql`(${t.type} = 'ESSAY') = (${t.rubric} is not null)`),
    check('questions_version_check', sql`${t.version} > 0`),
    // Same pattern as ai.llm_calls.prompt_version: `<agent>/v<N>`.
    check('questions_prompt_version_check', sql`${t.promptVersion} ~ '^[a-z][a-z0-9_]*/v[1-9][0-9]*$'`),
  ],
);
