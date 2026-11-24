import {
  ACTOR_KINDS,
  type ActorKind,
  CV_EVALUATION_STATUSES,
  CV_TRUST_LEVELS,
  CV_VERIFICATION_STATUSES,
  type CvClaimRef,
  type CvEvaluationStatus,
  type CvTrustLevel,
  type CvVerificationStatus,
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
  type ManualQuestionRejection,
  type MissingCell,
  QUESTION_BANK_RUN_KINDS,
  QUESTION_BANK_STATES,
  QUESTION_DIFFICULTIES,
  QUESTION_GENERATION_RUN_STATUSES,
  QUESTION_STATES,
  QUESTION_TYPES,
  type QuestionAnswerKey,
  type QuestionBankRunKind,
  type QuestionBankStatus,
  type QuestionContent,
  type QuestionDifficulty,
  type QuestionGenerationRunStatus,
  QUESTION_REVIEW_VERDICTS,
  type QuestionReviewVerdict,
  type QuestionRubric,
  QUESTION_SOURCES,
  type QuestionSource,
  type QuestionStatus,
  type QuestionType,
  type QuestionValidation,
  type StoredCvEvaluation,
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
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { campaigns } from './campaigns.js';
import { id, inList, oneOf, ref, rowVersion, timestamptz, timestamps } from './columns.js';
import { core } from './core.js';
import { cvs } from './cvs.js';
import { jobDescriptions } from './job-descriptions.js';
import { preferences } from './matching.js';
import { students } from './students.js';
import { users } from './users.js';

/**
 * The question bank of a JD and its exam blueprint (BR-05, FR-18, US-4.1, CONTEXT D49). One bank
 * per JD (Q2, decided in part), made when the JD is approved; CENTER edits `blueprint` until the
 * bank is locked (US-4.2, D50). `jd_version` is the JD version the bank was made for. Once LOCKED,
 * a trigger keeps the bank and its questions as they are (migration 0031): only `version` rises,
 * by one per question retired.
 *
 * Part C (US-4.8 AC-1, CONTEXT D57): `cv_verification_enabled` and `cv_verification_count`, outside
 * the blueprint contract the Test Generator reads; the lock trigger keeps them too.
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
    cvVerificationEnabled: boolean('cv_verification_enabled').notNull().default(false),
    cvVerificationCount: smallint('cv_verification_count').notNull().default(2),
    rowVersion: rowVersion(),
    ...timestamps(),
  },
  (t) => [
    index('question_banks_campaign_id_idx').on(t.campaignId),
    check('question_banks_versions_check', sql`${t.jdVersion} > 0 and ${t.version} > 0`),
    oneOf('question_banks_status_check', t.status, QUESTION_BANK_STATES),
    check('question_banks_locked_check', sql`(${t.status} = 'LOCKED') = (${t.lockedAt} is not null)`),
    check('question_banks_cv_verification_count_check', sql`${t.cvVerificationCount} between 2 and 3`),
  ],
);

/**
 * One row per AI job of a bank (US-4.1 AC-4, AC-9, US-4.10 AC-2): `ai.questions.generate` for a
 * GENERATE run, `ai.questions.validate` for a VALIDATE run. A technical log like `match_runs`:
 * closed once by the result of its job. The job id is stored before the job is sent, so even an
 * answer that comes at once finds its run (LESSONS §33). At most one run per bank is RUNNING,
 * whatever its kind, so the bank is never filled and checked at once (AGENTS › Invariant 11); a
 * run whose result can no longer be expected is closed FAILED with `STALE` by the next one.
 */
export const questionGenerationRuns = core.table(
  'question_generation_runs',
  {
    id: id(),
    bankId: ref('bank_id')
      .notNull()
      .references(() => questionBanks.id),
    jobId: uuid('job_id').notNull().unique('question_generation_runs_job_id_key'),
    kind: text('kind').$type<QuestionBankRunKind>().notNull().default('GENERATE'),
    /** When the broker took the job; null until the API has handed it over. */
    dispatchedAt: timestamptz('dispatched_at'),
    status: text('status').$type<QuestionGenerationRunStatus>().notNull(),
    actorKind: text('actor_kind').$type<ActorKind>().notNull(),
    actorId: ref('actor_id').references(() => users.id),
    /** Cells still short of drafts when the job ended; null while it runs or when it failed whole. */
    missingCells: jsonb('missing_cells').$type<MissingCell[]>(),
    /** GENERATE: drafts of the result the bank did not hold yet. VALIDATE: questions it gave a verdict. */
    questionsReceived: integer('questions_received').notNull().default(0),
    errorCode: text('error_code'),
    ...timestamps(),
    finishedAt: timestamptz('finished_at'),
  },
  (t) => [
    oneOf('question_generation_runs_status_check', t.status, QUESTION_GENERATION_RUN_STATUSES),
    oneOf('question_generation_runs_kind_check', t.kind, QUESTION_BANK_RUN_KINDS),
    oneOf('question_generation_runs_actor_kind_check', t.actorKind, ACTOR_KINDS),
    // AC-4: one running job per bank, of either kind (US-4.10 AC-2).
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
 * Test Generator, each once by `draft_id` (`ai.question_drafts.id`), status DRAFT (usable, nobody
 * checked it) until the Validator's verdict moves it, with `validation`, to VALIDATED or REJECTED
 * (US-4.2 AC-5, US-4.10). DRAFT and VALIDATED questions are drawn; either may be RETIRED. CENTER
 * may reject either by hand, with `manual_rejection`: REJECTED before locking, RETIRED after (US-4.11).
 * `content` is what a student may see; `answer_key` and `rubric` never leave the server for a
 * student (AGENTS › Invariant 8).
 *
 * CENTER and HR also add questions by hand (US-4.13, CONTEXT D62): `source` MANUAL, `created_by`
 * the account, no draft, model or prompt (Invariant 12 is about LLM output), and never a verdict
 * of the Validator, which reads drafts only. They start DRAFT like the drafts.
 */
export const questions = core.table(
  'questions',
  {
    id: id(),
    bankId: ref('bank_id')
      .notNull()
      .references(() => questionBanks.id),
    /** `ai.question_drafts.id` of an AI question; no foreign key across the schemas the two services own (AD-4). */
    draftId: bigint('draft_id', { mode: 'number' }).unique('questions_draft_id_key'),
    source: text('source').$type<QuestionSource>().notNull().default('AI'),
    /** The CENTER or HR account that added a MANUAL question (US-4.13 AC-1); null for an AI one. */
    createdBy: ref('created_by').references(() => users.id),
    type: text('type').$type<QuestionType>().notNull(),
    skill: text('skill').notNull(),
    difficulty: text('difficulty').$type<QuestionDifficulty>().notNull(),
    content: jsonb('content').$type<QuestionContent>().notNull(),
    answerKey: jsonb('answer_key').$type<QuestionAnswerKey>().notNull(),
    rubric: jsonb('rubric').$type<QuestionRubric>(),
    status: text('status').$type<QuestionStatus>().notNull().default('DRAFT'),
    /** The Validator's verdict with its model and prompt (Invariant 12); null while DRAFT, and on a question retired unchecked. */
    validation: jsonb('validation').$type<QuestionValidation>(),
    /** CENTER's rejection by hand (US-4.11 AC-3), set with REJECTED or RETIRED; null otherwise. */
    manualRejection: jsonb('manual_rejection').$type<ManualQuestionRejection>(),
    version: integer('version').notNull().default(1),
    /** The model and prompt that wrote an AI question (Invariant 12); null for a MANUAL one. */
    model: text('model'),
    promptVersion: text('prompt_version'),
    rowVersion: rowVersion(),
    ...timestamps(),
  },
  (t) => [
    // Coverage and the exam draw read a bank's questions by cell and status (US-4.3).
    index('questions_bank_cell_status_idx').on(t.bankId, t.skill, t.difficulty, t.status),
    oneOf('questions_source_check', t.source, QUESTION_SOURCES),
    // US-4.13 AC-8: an AI question has its draft, model and prompt and no author; a MANUAL one the
    // other way round, and no Validator verdict, since the Validator reads drafts only.
    check(
      'questions_author_check',
      sql`(${t.source} = 'AI' and ${t.draftId} is not null and ${t.model} is not null and ${t.promptVersion} is not null and ${t.createdBy} is null) or (${t.source} = 'MANUAL' and ${t.draftId} is null and ${t.model} is null and ${t.promptVersion} is null and ${t.createdBy} is not null and ${t.validation} is null)`,
    ),
    oneOf('questions_type_check', t.type, QUESTION_TYPES),
    oneOf('questions_difficulty_check', t.difficulty, QUESTION_DIFFICULTIES),
    oneOf('questions_status_check', t.status, QUESTION_STATES),
    // A checked status has its verdict; a DRAFT has none; a RETIRED one keeps what it had (US-4.10 AC-4).
    // CENTER rejects a question checked or not, so a REJECTED one has the Validator's REJECTED verdict or a
    // rejection by hand (US-4.11): nothing else may reject a question.
    check(
      'questions_validation_check',
      sql`${t.status} = 'RETIRED' or (${t.status} = 'REJECTED' and ${t.manualRejection} is not null) or ((${t.status} = 'DRAFT') = (${t.validation} is null) and (${t.status} <> 'REJECTED' or ${t.validation} ->> 'status' = 'REJECTED'))`,
    ),
    // A rejection by hand removes the question from the bank (US-4.11 AC-3).
    check(
      'questions_manual_rejection_check',
      sql`${t.manualRejection} is null or ${t.status} in ('REJECTED', 'RETIRED')`,
    ),
    // An essay is graded by its rubric; a multiple-choice question has none.
    check('questions_rubric_check', sql`(${t.type} = 'ESSAY') = (${t.rubric} is not null)`),
    check('questions_version_check', sql`${t.version} > 0`),
    // Same pattern as ai.llm_calls.prompt_version: `<agent>/v<N>`.
    check('questions_prompt_version_check', sql`${t.promptVersion} ~ '^[a-z][a-z0-9_]*/v[1-9][0-9]*$'`),
  ],
);

/**
 * Sample reviews of a question bank by HR or CENTER (FR-19, US-4.9): one row per verdict, kept as a
 * log; the latest row of a question is its review. `bank_version` is the bank's version when the
 * verdict was given. An ERROR retires the question in the same transaction, so a question has at
 * most one ERROR (AGENTS › Invariant 11), and it always says why.
 */
export const questionReviews = core.table(
  'question_reviews',
  {
    id: id(),
    questionId: ref('question_id')
      .notNull()
      .references(() => questions.id),
    bankVersion: integer('bank_version').notNull(),
    reviewerId: ref('reviewer_id')
      .notNull()
      .references(() => users.id),
    verdict: text('verdict').$type<QuestionReviewVerdict>().notNull(),
    reason: text('reason'),
    reviewedAt: timestamptz('reviewed_at').notNull(),
  },
  (t) => [
    index('question_reviews_question_id_idx').on(t.questionId),
    uniqueIndex('question_reviews_question_error_key')
      .on(t.questionId)
      .where(sql`${t.verdict} = 'ERROR'`),
    oneOf('question_reviews_verdict_check', t.verdict, QUESTION_REVIEW_VERDICTS),
    check('question_reviews_reason_check', sql`${t.verdict} <> 'ERROR' or btrim(coalesce(${t.reason}, '')) <> ''`),
    check('question_reviews_bank_version_check', sql`${t.bankVersion} > 0`),
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
    /**
     * Part C (US-4.8, CONTEXT D57): `cv_verification_questions.id` in display order, after
     * `question_ids`; empty without part C. Kept apart, so grading never sees them (AC-6).
     */
    verificationQuestionIds: bigint('verification_question_ids', { mode: 'number' })
      .array()
      .notNull()
      .default(sql`'{}'::bigint[]`),
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
 * Part C of one preference (FR-25, US-4.8, CONTEXT D57). A technical log like
 * `essay_grading_runs`, with no lifecycle: the drafting job (`status`, `job_id`), written before
 * the job is sent (LESSONS §33), then, once the session it went into closed, the checking job
 * (`evaluation_*`) and the trust index code computes from its verdicts. `session_id` is set when a
 * session starts with the READY questions; a row READY only after that start stays unattached.
 */
export const cvVerifications = core.table(
  'cv_verifications',
  {
    id: id(),
    preferenceId: ref('preference_id')
      .notNull()
      .unique('cv_verifications_preference_id_key')
      .references(() => preferences.id),
    cvId: ref('cv_id')
      .notNull()
      .references(() => cvs.id),
    cvVersion: integer('cv_version').notNull(),
    jdId: ref('jd_id')
      .notNull()
      .references(() => jobDescriptions.id),
    questionCount: smallint('question_count').notNull(),
    sessionId: ref('session_id')
      .unique('cv_verifications_session_id_key')
      .references(() => examSessions.id),
    status: text('status').$type<CvVerificationStatus>().notNull().default('RUNNING'),
    jobId: uuid('job_id').notNull().unique('cv_verifications_job_id_key'),
    /** When the broker took the drafting job; null until the API has handed it over. */
    dispatchedAt: timestamptz('dispatched_at'),
    model: text('model'),
    promptVersion: text('prompt_version'),
    errorCode: text('error_code'),
    evaluationStatus: text('evaluation_status').$type<CvEvaluationStatus>(),
    evaluationJobId: uuid('evaluation_job_id').unique('cv_verifications_evaluation_job_id_key'),
    evaluationRequestedAt: timestamptz('evaluation_requested_at'),
    evaluationDispatchedAt: timestamptz('evaluation_dispatched_at'),
    /** Null when every answer was blank: no LLM was called. */
    evaluationModel: text('evaluation_model'),
    evaluationPromptVersion: text('evaluation_prompt_version'),
    evaluationErrorCode: text('evaluation_error_code'),
    /** 0–100: the mean of the verdict points, half-up (AC-5); with DONE. Never scored (AC-6). */
    trustX100: integer('trust_x100'),
    trustLevel: text('trust_level').$type<CvTrustLevel>(),
    rowVersion: rowVersion(),
    ...timestamps(),
  },
  (t) => [
    oneOf('cv_verifications_status_check', t.status, CV_VERIFICATION_STATUSES),
    oneOf('cv_verifications_evaluation_status_check', t.evaluationStatus, CV_EVALUATION_STATUSES),
    oneOf('cv_verifications_trust_level_check', t.trustLevel, CV_TRUST_LEVELS),
    check('cv_verifications_counts_check', sql`${t.questionCount} between 2 and 3 and ${t.cvVersion} > 0`),
    check(
      'cv_verifications_ready_check',
      sql`${t.status} <> 'READY' or (${t.model} is not null and ${t.promptVersion} is not null)`,
    ),
    check('cv_verifications_failed_check', sql`${t.status} <> 'FAILED' or ${t.errorCode} is not null`),
    // Only READY questions go into a session, and only a session's questions are checked.
    check('cv_verifications_session_check', sql`${t.sessionId} is null or ${t.status} = 'READY'`),
    check('cv_verifications_evaluation_session_check', sql`${t.evaluationStatus} is null or ${t.sessionId} is not null`),
    check(
      'cv_verifications_evaluation_job_check',
      sql`(${t.evaluationStatus} is null) = (${t.evaluationJobId} is null) and (${t.evaluationJobId} is null) = (${t.evaluationRequestedAt} is null)`,
    ),
    check(
      'cv_verifications_evaluation_failed_check',
      sql`${t.evaluationStatus} is distinct from 'FAILED' or ${t.evaluationErrorCode} is not null`,
    ),
    check(
      'cv_verifications_trust_check',
      sql`(${t.evaluationStatus} is not distinct from 'DONE') = (${t.trustX100} is not null) and (${t.trustX100} is null) = (${t.trustLevel} is null) and ${t.trustX100} between 0 and 100`,
    ),
    // Same pattern as ai.llm_calls.prompt_version: `<agent>/v<N>`.
    check('cv_verifications_prompt_version_check', sql`${t.promptVersion} ~ '^[a-z][a-z0-9_]*/v[1-9][0-9]*$'`),
    check(
      'cv_verifications_evaluation_prompt_version_check',
      sql`${t.evaluationPromptVersion} ~ '^[a-z][a-z0-9_]*/v[1-9][0-9]*$'`,
    ),
  ],
);

/**
 * The questions of part C (US-4.8 AC-2, AC-5). `id` comes from the sequence of `questions.id`, so a
 * part C question never shares an id with a bank question: the exam room keys both kinds by
 * question id (Redis, autosave). `claim_ref` points into `cvs.profile_masked` of the row's CV
 * version; `claim_label` names the entry. `answer` is written once, when the session closes (null
 * when blank); `evaluation` with the checking job's result.
 */
export const cvVerificationQuestions = core.table(
  'cv_verification_questions',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .default(sql`nextval('core.questions_id_seq')`),
    verificationId: ref('verification_id')
      .notNull()
      .references(() => cvVerifications.id),
    no: smallint('no').notNull(),
    stem: text('stem').notNull(),
    claimRef: jsonb('claim_ref').$type<CvClaimRef>().notNull(),
    claimLabel: text('claim_label').notNull(),
    answer: text('answer'),
    evaluation: jsonb('evaluation').$type<StoredCvEvaluation>(),
    ...timestamps(),
  },
  (t) => [
    unique('cv_verification_questions_verification_no_key').on(t.verificationId, t.no),
    check('cv_verification_questions_no_check', sql`${t.no} between 1 and 3`),
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
