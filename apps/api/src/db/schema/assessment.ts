import {
  ACTOR_KINDS,
  type ActorKind,
  ESSAY_GRADING_RUN_STATUSES,
  EXAM_GRADING_REASONS,
  EXAM_SESSION_STATES,
  type EssayGradingRunStatus,
  type ExamAnswerAiGrading,
  type ExamBlueprint,
  type ExamGradingReason,
  type ExamOptionLayout,
  type ExamSessionFlag,
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
  type StoredManualGrading,
  type StoredSkillScore,
} from '@srm/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { campaigns } from './campaigns.js';
import { id, inList, oneOf, ref, rowVersion, timestamptz, timestamps } from './columns.js';
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
 * is set with the closing status, never after `deadline_at`.
 *
 * Grading (US-4.4, CONTEXT D53): `essay_run_id` is the essay grading job the session was sent with,
 * once, so a second dispatch never grades it again. `score_a`, `score_b`, `s_test` (0–100) and
 * `skill_scores` are computed by code in the transaction that publishes the results, with
 * `results_published_at`; an appeal (US-4.6) may change the scores, never unpublish them.
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
    essayRunId: ref('essay_run_id').references(() => essayGradingRuns.id),
    scoreA: numeric('score_a', { precision: 5, scale: 2, mode: 'number' }),
    scoreB: numeric('score_b', { precision: 5, scale: 2, mode: 'number' }),
    sTest: numeric('s_test', { precision: 5, scale: 2, mode: 'number' }),
    skillScores: jsonb('skill_scores').$type<StoredSkillScore[]>(),
    /** Warnings for staff (Invariant 8): the Grader's flags here, the cheating signals in US-4.7. */
    flags: jsonb('flags').$type<ExamSessionFlag[]>().notNull().default([]),
    resultsPublishedAt: timestamptz('results_published_at'),
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
    check(
      'exam_sessions_scores_check',
      sql`${t.scoreA} between 0 and 100 and ${t.scoreB} between 0 and 100 and ${t.sTest} between 0 and 100`,
    ),
    // US-4.4 AC-11: the scores are written together, with the publication of the results.
    check(
      'exam_sessions_results_check',
      sql`(${t.resultsPublishedAt} is null) = (${t.sTest} is null) and (${t.sTest} is null) = (${t.scoreA} is null) and (${t.sTest} is null) = (${t.scoreB} is null) and (${t.sTest} is null) = (${t.skillScores} is null)`,
    ),
    check('exam_sessions_results_closed_check', sql`${t.resultsPublishedAt} is null or ${t.status} <> 'IN_PROGRESS'`),
    check('exam_sessions_flags_check', sql`jsonb_typeof(${t.flags}) = 'array'`),
    // The grading sweep reads the sessions of a bank still waiting for their results.
    index('exam_sessions_unpublished_bank_idx')
      .on(t.bankId)
      .where(sql`${t.resultsPublishedAt} is null`),
  ],
);

/**
 * Answers of a closed session, written once from Redis in the transaction that closes it (AC-8).
 * `answer` holds the original index of an MCQ option for grading; it never leaves the server.
 *
 * Grading (US-4.4, CONTEXT D53), in points of the question: an MCQ is worth 1, an essay the sum of
 * its rubric's `max_points`. `auto_score` is the code's grade of an MCQ, written when the session
 * closes. `ai_grading` keeps each pass of the Grader, or why it gave nothing. `final_score` is
 * the score that counts: the MCQ grade, the mean of the two passes, or a human grader's (US-4.5).
 * `needs_human_reasons` says why an essay went to a human grader, and stays once graded.
 *
 * Manual grading (US-4.5, CONTEXT D54): `id` names an answer in the API (`/api/exam-answers/{id}`);
 * the key stays `(session_id, question_id)`. A human grade writes `final_score`, `manual_grading`,
 * `graded_by` and `graded_at` together and bumps `row_version` (AD-8).
 */
export const examAnswers = core.table(
  'exam_answers',
  {
    id: bigint('id', { mode: 'number' }).notNull().generatedAlwaysAsIdentity(),
    sessionId: ref('session_id')
      .notNull()
      .references(() => examSessions.id),
    questionId: ref('question_id')
      .notNull()
      .references(() => questions.id),
    answer: jsonb('answer').$type<ExamStoredAnswer>().notNull(),
    autoScore: numeric('auto_score', { precision: 6, scale: 2, mode: 'number' }),
    aiGrading: jsonb('ai_grading').$type<ExamAnswerAiGrading>(),
    needsHuman: boolean('needs_human').notNull().default(false),
    needsHumanReasons: text('needs_human_reasons').array().$type<ExamGradingReason[]>().notNull().default([]),
    finalScore: numeric('final_score', { precision: 6, scale: 2, mode: 'number' }),
    manualGrading: jsonb('manual_grading').$type<StoredManualGrading>(),
    gradedBy: ref('graded_by').references(() => users.id),
    gradedAt: timestamptz('graded_at'),
    rowVersion: rowVersion(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.questionId] }),
    unique('exam_answers_id_key').on(t.id),
    check('exam_answers_scores_check', sql`${t.autoScore} >= 0 and ${t.finalScore} >= 0`),
    check(
      'exam_answers_needs_human_reasons_check',
      sql`${t.needsHumanReasons} <@ array[${inList(EXAM_GRADING_REASONS)}]::text[]`,
    ),
    check('exam_answers_needs_human_check', sql`${t.needsHuman} = (cardinality(${t.needsHumanReasons}) > 0)`),
    // The queue of US-4.5: answers still waiting for a human grader.
    index('exam_answers_needs_human_idx')
      .on(t.sessionId)
      .where(sql`${t.needsHuman} and ${t.finalScore} is null`),
    // US-4.5 (AGENTS › Invariant 11): a human grade is written whole, and only as the final score
    // of an answer that went to a human grader.
    check(
      'exam_answers_manual_check',
      sql`(${t.manualGrading} is null) = (${t.gradedBy} is null) and (${t.manualGrading} is null) = (${t.gradedAt} is null)`,
    ),
    check(
      'exam_answers_manual_final_check',
      sql`${t.manualGrading} is null or (${t.needsHuman} and ${t.finalScore} is not null)`,
    ),
  ],
);

/**
 * One row per `ai.essay.grade` job (US-4.4 AC-2, CONTEXT D53). A technical log like
 * `question_generation_runs`: the job id is stored, and the sessions point at the run, in the
 * transaction before the job is sent (LESSONS §33). Several runs of a campaign may be RUNNING: a
 * session belongs to one run only (`exam_sessions.essay_run_id`). `prompt_version` is the prompt
 * of the job's grades, from its first result; the next job of the campaign is pinned to it (D46).
 */
export const essayGradingRuns = core.table(
  'essay_grading_runs',
  {
    id: id(),
    campaignId: ref('campaign_id')
      .notNull()
      .references(() => campaigns.id),
    jobId: uuid('job_id').notNull().unique('essay_grading_runs_job_id_key'),
    /** When the broker took the job; null until the API has handed it over. */
    dispatchedAt: timestamptz('dispatched_at'),
    status: text('status').$type<EssayGradingRunStatus>().notNull().default('RUNNING'),
    actorKind: text('actor_kind').$type<ActorKind>().notNull(),
    actorId: ref('actor_id').references(() => users.id),
    sessionCount: integer('session_count').notNull(),
    promptVersion: text('prompt_version'),
    errorCode: text('error_code'),
    ...timestamps(),
    finishedAt: timestamptz('finished_at'),
  },
  (t) => [
    oneOf('essay_grading_runs_status_check', t.status, ESSAY_GRADING_RUN_STATUSES),
    oneOf('essay_grading_runs_actor_kind_check', t.actorKind, ACTOR_KINDS),
    index('essay_grading_runs_campaign_id_status_idx').on(t.campaignId, t.status),
    check('essay_grading_runs_finished_check', sql`(${t.status} = 'RUNNING') = (${t.finishedAt} is null)`),
    check('essay_grading_runs_actor_check', sql`(${t.actorKind} = 'USER') = (${t.actorId} is not null)`),
    check('essay_grading_runs_error_check', sql`${t.status} not in ('FAILED', 'STALE') or ${t.errorCode} is not null`),
    check('essay_grading_runs_session_count_check', sql`${t.sessionCount} > 0`),
    // Same pattern as ai.llm_calls.prompt_version: `<agent>/v<N>`.
    check('essay_grading_runs_prompt_version_check', sql`${t.promptVersion} ~ '^[a-z][a-z0-9_]*/v[1-9][0-9]*$'`),
  ],
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
