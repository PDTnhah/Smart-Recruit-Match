import {
  ACTOR_KINDS,
  type ActorKind,
  EXAM_SESSION_STATES,
  type ExamBlueprint,
  type ExamOptionLayout,
  type ExamSessionStatus,
  type ExamStoredAnswer,
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
import { bigint, check, index, integer, jsonb, primaryKey, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { campaigns } from './campaigns.js';
import { id, oneOf, ref, rowVersion, timestamptz, timestamps } from './columns.js';
import { core } from './core.js';
import { jobDescriptions } from './job-descriptions.js';
import { students } from './students.js';
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

/**
 * A student's single attempt at the test of one preference (FR-20, BR-06, US-4.3, CONTEXT D51).
 * The preference is not referenced: `preferences(student_id, jd_id)` and `question_banks(jd_id)` are
 * both unique, so `(student_id, bank_id)` names exactly one. The draw is kept whole, so the same
 * paper shows again after a reload, even with a question retired since: `question_ids` in display
 * order, `option_layout` with the opaque code and original index of each MCQ option (server only,
 * AGENTS › Invariant 8). `deadline_at` is `min(started_at + duration, testing_end)`; `submitted_at`
 * is set with the closing status, never after `deadline_at`. US-4.4 adds the grading columns.
 */
export const examSessions = core.table(
  'exam_sessions',
  {
    id: id(),
    studentId: ref('student_id')
      .notNull()
      .references(() => students.id),
    bankId: ref('bank_id')
      .notNull()
      .references(() => questionBanks.id),
    /** `question_banks.version` the paper was drawn from (US-4.2 AC-7). */
    bankVersion: integer('bank_version').notNull(),
    /** Seed of the draw: the same bank version and seed give the same paper (BR-05, AC-2). */
    seed: integer('seed').notNull(),
    questionIds: bigint('question_ids', { mode: 'number' }).array().notNull(),
    optionLayout: jsonb('option_layout').$type<ExamOptionLayout>().notNull(),
    startedAt: timestamptz('started_at').notNull(),
    deadlineAt: timestamptz('deadline_at').notNull(),
    /** Set with SUBMITTED or EXPIRED, in the same UPDATE (`transitionTo` `set`). */
    submittedAt: timestamptz('submitted_at'),
    status: text('status').$type<ExamSessionStatus>().notNull().default('IN_PROGRESS'),
    rowVersion: rowVersion(),
    ...timestamps(),
  },
  (t) => [
    // BR-06 (AGENTS › Invariant 11): one attempt per student and bank, so per preference.
    unique('exam_sessions_student_bank_key').on(t.studentId, t.bankId),
    oneOf('exam_sessions_status_check', t.status, EXAM_SESSION_STATES),
    check('exam_sessions_deadline_check', sql`${t.deadlineAt} > ${t.startedAt}`),
    check('exam_sessions_submitted_check', sql`(${t.status} = 'IN_PROGRESS') = (${t.submittedAt} is null)`),
    check('exam_sessions_submitted_at_check', sql`${t.submittedAt} between ${t.startedAt} and ${t.deadlineAt}`),
    check('exam_sessions_draw_check', sql`${t.bankVersion} > 0 and ${t.seed} >= 0 and cardinality(${t.questionIds}) > 0`),
    // The sweep closes open sessions past their deadline (AC-9).
    index('exam_sessions_open_deadline_idx')
      .on(t.deadlineAt)
      .where(sql`${t.status} = 'IN_PROGRESS'`),
  ],
);

/**
 * Answers of a closed session, written once from Redis in the transaction that closes it (AC-8).
 * `answer` holds the original index of an MCQ option for grading (US-4.4); it never leaves the
 * server. US-4.4 and US-4.6 add the score columns.
 */
export const examAnswers = core.table(
  'exam_answers',
  {
    sessionId: ref('session_id')
      .notNull()
      .references(() => examSessions.id),
    questionId: ref('question_id')
      .notNull()
      .references(() => questions.id),
    answer: jsonb('answer').$type<ExamStoredAnswer>().notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.questionId] })],
);

/**
 * What happened in a session, for the cheating signals of US-4.7, which adds the list of types and
 * the endpoint that writes them. Signals only warn; they never fail a student (Invariant 8).
 */
export const examEvents = core.table(
  'exam_events',
  {
    id: id(),
    sessionId: ref('session_id')
      .notNull()
      .references(() => examSessions.id),
    type: text('type').notNull(),
    occurredAt: timestamptz('occurred_at').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('exam_events_session_id_idx').on(t.sessionId),
    check('exam_events_type_check', sql`${t.type} ~ '^[A-Z][A-Z_]*$'`),
  ],
);
