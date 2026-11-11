import { z } from 'zod';
import type { GradingFlag, GradingResult } from '../contracts/essay-grade.js';
import { APPLICATION_STATES } from '../states/application.js';

// Grading of an exam session and its results (US-4.4, FR-22, GĐ6, CONTEXT D53). Code grades the
// multiple-choice questions and computes every score (AD-2); the Grader grades each essay twice.

// --- Stored on the server only ---------------------------------------------------------------------

/**
 * Why an essay answer goes to a human grader (US-4.4 AC-6), in the order code checks them:
 * - RUNS_DIVERGE: the two passes differ by more than 15% of the question's points;
 * - LOW_CONFIDENCE: a pass has confidence LOW;
 * - FLAGGED: a pass flagged the answer, e.g. INSTRUCTION_IN_ANSWER;
 * - AI_FAILED: a pass has no grade (refused, invalid, out of range, expired);
 * - NEAR_THRESHOLD: S_test with the Grader's points is within 5 points of θ_test, so every
 *   answered essay of the session goes to a human grader.
 */
export const EXAM_GRADING_REASONS = [
  'RUNS_DIVERGE',
  'LOW_CONFIDENCE',
  'FLAGGED',
  'AI_FAILED',
  'NEAR_THRESHOLD',
] as const;

export type ExamGradingReason = (typeof EXAM_GRADING_REASONS)[number];

/**
 * `essay_grading_runs.status`: RUNNING until the last message of its job, with every pass in;
 * SUCCEEDED or PARTIAL as that message says, FAILED when the job failed whole, STALE when passes were
 * still missing after 7 days.
 */
export const ESSAY_GRADING_RUN_STATUSES = ['RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'STALE'] as const;

export type EssayGradingRunStatus = (typeof ESSAY_GRADING_RUN_STATUSES)[number];

/** One pass of the Grader over an answer, with the model and prompt (AGENTS › Invariant 12). */
export interface StoredGradingRun {
  model: string;
  prompt_version: string;
  grading: GradingResult;
  /** Σ criterion points, added by code (AD-2). */
  points: number;
}

/**
 * A pass left without a grade: by the AI Service, by the backend's own check of the points, or by
 * a job that failed whole or never answered (`prompt_version` null then).
 */
export interface StoredGradingFailure {
  code: string;
  needs_review: boolean;
  prompt_version: string | null;
}

/** The two passes of a grading, keyed "1" and "2"; each is written once (CONTEXT D53). */
export type GradingPassKey = '1' | '2';

/** `exam_answers.ai_grading`: what each pass of the Grader gave, or why it gave nothing. */
export interface ExamAnswerAiGrading {
  runs: Partial<Record<GradingPassKey, StoredGradingRun>>;
  failures: Partial<Record<GradingPassKey, StoredGradingFailure>>;
}

/**
 * `exam_answers.manual_grading` (US-4.5, CONTEXT D54): the points a human grader gave each rubric
 * criterion, in rubric order, and their note. Staff only: the student sees the answer's total.
 */
export interface StoredManualGrading {
  criteria: { index: number; points: number }[];
  note: string | null;
}

/**
 * One entry of `exam_sessions.flags`: a warning for staff, never a fail (AGENTS › Invariant 8).
 * US-4.4 writes the Grader's flags with their question; US-4.7 adds the cheating signals.
 */
export interface ExamSessionFlag {
  code: GradingFlag;
  questionId: number;
}

/** `exam_sessions.skill_scores`: one entry per skill of the paper, in skill order. */
export interface StoredSkillScore {
  skill: string;
  /** Weighted mean of the success rates × 100 × 100; null when every question of it weighs 0. */
  scoreX100: number | null;
}

// --- API: GET /api/exam-sessions/{id}/result (AC-12) ------------------------------------------------
//
// A whitelist (AGENTS › Invariant 8): no answer key, rubric text or sample answer, and nothing per
// multiple-choice question, since other students draw the same questions.

const id = z.number().int().positive();
const instant = z.iso.datetime({ offset: true });
const score = () => z.number().min(0).max(100);

/** GRADING until every answer has its final score and S_final is computed; then PUBLISHED. */
export const EXAM_RESULT_STATES = ['GRADING', 'PUBLISHED'] as const;

export type ExamResultState = (typeof EXAM_RESULT_STATES)[number];

export const ExamResultSkillSchema = z.object({
  skill: z.string(),
  /** 0–100; null when the skill's questions all belong to a part that weighs 0. */
  score: score().nullable(),
});

export type ExamResultSkill = z.output<typeof ExamResultSkillSchema>;

/** One criterion of an essay as the student sees it: its number, not the rubric's words. */
export const ExamResultCriterionSchema = z.object({
  no: z.number().int().positive(),
  /** The mean of the two passes. */
  points: z.number().min(0),
  maxPoints: z.number().int().positive(),
  /** The Grader's reason in the first pass. */
  reason: z.string(),
});

export type ExamResultCriterion = z.output<typeof ExamResultCriterionSchema>;

export const ExamResultEssaySchema = z.object({
  questionId: id,
  /** Number of the question in the paper, from 1 across both parts. */
  no: z.number().int().positive(),
  stem: z.string(),
  points: z.number().min(0),
  maxPoints: z.number().int().positive(),
  /** Empty for a blank answer, or one graded by staff. */
  criteria: z.array(ExamResultCriterionSchema),
});

export type ExamResultEssay = z.output<typeof ExamResultEssaySchema>;

/**
 * The preference the session was the test of (one bank per JD, one session per bank); `sCv` and
 * `sFinal` are the two numbers stored when the results were published.
 */
export const ExamResultPreferenceSchema = z.object({
  preferenceId: id,
  rank: z.number().int().positive(),
  sCv: score().nullable(),
  sFinal: score().nullable(),
  status: z.enum(APPLICATION_STATES),
});

export type ExamResultPreference = z.output<typeof ExamResultPreferenceSchema>;

/** What a published result shows. */
export const ExamResultScoresSchema = z.object({
  publishedAt: instant,
  sTest: score(),
  partA: score(),
  partB: score(),
  skills: z.array(ExamResultSkillSchema),
  /** Null when the student has no preference for the JD any more. */
  preference: ExamResultPreferenceSchema.nullable(),
  essays: z.array(ExamResultEssaySchema),
});

export type ExamResultScores = z.output<typeof ExamResultScoresSchema>;

/**
 * One object rather than a union on `state`, so the API's DTO can be built from it: `scores` is
 * null while GRADING and set once PUBLISHED.
 */
export const ExamResultSchema = z
  .object({
    state: z.enum(EXAM_RESULT_STATES),
    sessionId: id,
    jdTitle: z.string(),
    companyName: z.string(),
    submittedAt: instant,
    scores: ExamResultScoresSchema.nullable(),
  })
  .refine((result) => (result.state === 'PUBLISHED') === (result.scores !== null), {
    error: 'scores are set exactly when the result is PUBLISHED',
    path: ['scores'],
  });

export type ExamResult = z.output<typeof ExamResultSchema>;

// --- API: POST /api/campaigns/{id}/essay-grading (AC-2) ---------------------------------------------

/**
 * What one call created: a job per run, each of at most ESSAY_GRADE_MAX_SESSIONS sessions. `sent`
 * is false when the broker did not take the job; the grading sweep sends it again.
 */
export const EssayGradingDispatchSchema = z.object({
  runs: z.array(z.object({ runId: id, sessionCount: z.number().int().positive(), sent: z.boolean() })),
});

export type EssayGradingDispatch = z.output<typeof EssayGradingDispatchSchema>;
