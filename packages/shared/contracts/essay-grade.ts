import { z } from 'zod';
import { RUBRIC_MAX_CRITERIA, RUBRIC_MAX_POINTS } from './questions.js';

// Essay grading by the Grader (US-4.4, FR-22, AD-2, CONTEXT D46, D53). Each answered essay is graded
// twice, independently, through the provider's batch; code adds the criterion points, decides which
// answers go to a human grader and computes S_test. Shape and limits only (LESSONS §32): the AI
// Service checks the points against the rubric, and the backend checks them again, so an
// out-of-range grade never fails a whole message.

/** Most sessions one `ai.essay.grade` job carries. */
export const ESSAY_GRADE_MAX_SESSIONS = 5_000;

/** Independent gradings of each answer (ARCHITECTURE › Pipeline › Grader). */
export const ESSAY_GRADE_PASSES = 2;

/** Most items, and most failed passes, one `ai.results` message of an ESSAY_GRADE job carries. */
export const ESSAY_GRADE_CHUNK_MAX = 500;

/** How sure the Grader is of a grade; only LOW sends the answer to a human grader (CONTEXT D53). */
export const GRADING_CONFIDENCES = ['LOW', 'MEDIUM', 'HIGH'] as const;

export type GradingConfidence = (typeof GRADING_CONFIDENCES)[number];

/** INSTRUCTION_IN_ANSWER: the answer tries to instruct the grader; it is data, never followed. */
export const GRADING_FLAGS = ['INSTRUCTION_IN_ANSWER'] as const;

export type GradingFlag = (typeof GRADING_FLAGS)[number];

const rowId = () => z.int().positive();

export const GradingConfidenceSchema = z
  .enum(GRADING_CONFIDENCES)
  .meta({ title: 'GradingConfidence', description: 'LOW, MEDIUM or HIGH; LOW sends the answer to a human grader' });

export const GradingFlagSchema = z
  .enum(GRADING_FLAGS)
  .meta({ title: 'GradingFlag', description: 'INSTRUCTION_IN_ANSWER: the answer tries to instruct the grader' });

export const GradingCriterionSchema = z
  .strictObject({
    index: z
      .int()
      .min(0)
      .max(RUBRIC_MAX_CRITERIA - 1)
      .describe('Index of the criterion in the rubric, from 0'),
    points: z
      .int()
      .min(0)
      .max(RUBRIC_MAX_POINTS)
      .describe("Points given, from 0 to the criterion's max_points"),
    reason: z.string().trim().min(1).max(1_000).describe('Why these points, in Vietnamese, citing the answer'),
  })
  .meta({ title: 'GradingCriterion', description: 'The grade of one rubric criterion' });

export type GradingCriterion = z.output<typeof GradingCriterionSchema>;

/**
 * What the Grader returns for one answer in one pass (US-4.4 AC-3): a grade per criterion of the
 * rubric, no total (AD-2).
 */
export const GradingResultSchema = z
  .strictObject({
    criteria: z
      .array(GradingCriterionSchema)
      .min(1)
      .max(RUBRIC_MAX_CRITERIA)
      .describe('One grade per rubric criterion, in rubric order'),
    confidence: GradingConfidenceSchema,
    flags: z.array(GradingFlagSchema).max(GRADING_FLAGS.length).describe('Each flag once; empty when none'),
  })
  .meta({ title: 'GradingResult', description: "The Grader's grade of one essay answer, criterion by criterion" });

export type GradingResult = z.output<typeof GradingResultSchema>;

/**
 * Payload on `ai.essay.grade` (US-4.4 AC-2): the closed sessions whose answered essays still need
 * the Grader. The AI Service reads the questions and answers through `core.v_ai_essay_answers`.
 */
export const EssayGradeJobSchema = z
  .strictObject({
    job_id: z.uuid().describe('Unique id of this job; the AI Service processes each job_id once (AD-5)'),
    exam_session_ids: z
      .array(rowId())
      .min(1)
      .max(ESSAY_GRADE_MAX_SESSIONS)
      .describe('core.exam_sessions.id of the sessions to grade, without duplicates'),
    prompt_version: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .nullable()
      .describe('Prompt the campaign is pinned to, e.g. grader/v1; null until it has a result, then the active one'),
  })
  .meta({ title: 'EssayGradeJob', description: 'Job on ai.essay.grade: grade the answered essays of closed sessions' });

export type EssayGradeJob = z.infer<typeof EssayGradeJobSchema>;

const answerRef = {
  session_id: rowId().describe('core.exam_sessions.id'),
  question_id: rowId().describe('core.questions.id of the essay'),
  // Not `pass`: a Python keyword, which the generated model would rename.
  pass_no: z.int().min(1).max(ESSAY_GRADE_PASSES).describe('Which of the two independent gradings, 1 or 2'),
};

export const EssayGradeItemSchema = z
  .strictObject({
    ...answerRef,
    // Per pass: a refusal resent on its own may be answered by a fallback model (Invariant 12).
    model: z.string().min(1).describe('Model id that produced this grade'),
    grading: GradingResultSchema,
  })
  .meta({ title: 'EssayGradeItem', description: 'One pass of the Grader over one answer, points checked' });

export type EssayGradeItem = z.output<typeof EssayGradeItemSchema>;

export const EssayGradeFailedItemSchema = z
  .strictObject({
    ...answerRef,
    code: z
      .string()
      .min(1)
      .max(50)
      .describe('Why there is no grade, e.g. LLM_REFUSAL, INVALID_OUTPUT, GRADING_OUT_OF_RANGE, EXPIRED, SOURCE_MISSING'),
    needs_review: z.boolean().describe('The LLM refused the answer again when sent on its own'),
  })
  .meta({ title: 'EssayGradeFailedItem', description: 'One pass of an ESSAY_GRADE job left without a grade' });

export type EssayGradeFailedItem = z.output<typeof EssayGradeFailedItemSchema>;

/**
 * Output of ESSAY_GRADE (US-4.4 AC-5, AC-7, CONTEXT D46, D53), sent in chunks, each carrying grades
 * and failed passes. Every message but the last has `final` false and status SUCCEEDED; the last one
 * is SUCCEEDED, or PARTIAL when any pass of the job failed, and closes the run. The backend stores
 * each pass once, whatever the order the messages arrive in, and adds the points itself (AD-2).
 */
export const EssayGradeOutputSchema = z
  .strictObject({
    prompt_version: z.string().min(1).describe('Versioned prompt of every grade of the job, e.g. grader/v1'),
    final: z.boolean().describe('Last message of the job'),
    items: z.array(EssayGradeItemSchema).max(ESSAY_GRADE_CHUNK_MAX),
    failed: z
      .array(EssayGradeFailedItemSchema)
      .max(ESSAY_GRADE_CHUNK_MAX)
      .describe('Passes left without a grade, in any message of the job'),
  })
  .meta({ title: 'EssayGradeOutput', description: 'One message of the result of ESSAY_GRADE' });

export type EssayGradeOutput = z.output<typeof EssayGradeOutputSchema>;
