import { z } from 'zod';
import { GRADING_CONFIDENCES, GRADING_FLAGS } from '../contracts/essay-grade.js';
import { RUBRIC_MAX_CRITERIA, RUBRIC_MAX_POINTS } from '../contracts/questions.js';
import type { QuestionRubric } from './exam-blueprint.js';
import { EXAM_GRADING_REASONS } from './exam-result.js';
import { optionalText, RowVersionSchema } from './common.js';

// Manual grading of the essays the Grader handed over (US-4.5, FR-23, AD-2, BR-03, CONTEXT D54).
// The grader enters points per rubric criterion; code adds them into the answer's final score.
// Responses are whitelists: nothing of the student, whose session shows as "Bài #<id>" (BR-03).

const id = z.number().int().positive();
const count = z.number().int().min(0);
const instant = z.iso.datetime({ offset: true });
const reasons = z.array(z.enum(EXAM_GRADING_REASONS));

/** Most characters of the grader's note, kept for staff and the audit log only. */
export const MANUAL_GRADE_NOTE_MAX = 1_000;

/** Sessions per page of the queue. */
export const GRADING_QUEUE_PAGE_MAX = 50;

// --- GET /api/campaigns/{id}/grading-queue (AC-1) --------------------------------------------------

export const GradingQueueQuerySchema = z.object({
  reason: z.enum(EXAM_GRADING_REASONS).optional(),
  /** Sessions, not answers: a session's answers stay on one page. */
  limit: z.coerce.number().int().min(1).max(GRADING_QUEUE_PAGE_MAX).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type GradingQueueQuery = z.output<typeof GradingQueueQuerySchema>;

export const GradingQueueAnswerSchema = z.object({
  answerId: id,
  /** Place of the question on the paper, from 1 across both parts. */
  questionNo: z.number().int().positive(),
  skill: z.string(),
  maxPoints: z.number().int().positive(),
  reasons: reasons.min(1),
});

export type GradingQueueAnswer = z.output<typeof GradingQueueAnswerSchema>;

export const GradingQueueSessionSchema = z.object({
  sessionId: id,
  jdTitle: z.string(),
  companyName: z.string(),
  submittedAt: instant,
  answers: z.array(GradingQueueAnswerSchema).min(1),
});

export type GradingQueueSession = z.output<typeof GradingQueueSessionSchema>;

/** Sessions with an essay still waiting for a human grader, by session id. */
export const GradingQueueSchema = z.object({
  items: z.array(GradingQueueSessionSchema),
  totalSessions: count,
  totalAnswers: count,
});

export type GradingQueue = z.output<typeof GradingQueueSchema>;

// --- GET /api/exam-answers/{id}/manual-grading (AC-2) ----------------------------------------------

export const ManualGradingRubricCriterionSchema = z.object({
  criterion: z.string(),
  maxPoints: z.number().int().positive(),
});

/** One criterion of a pass of the Grader: its points and reason. */
export const ManualGradingAiCriterionSchema = z.object({
  index: z.number().int().min(0),
  points: z.number().int().min(0),
  reason: z.string(),
});

/**
 * One pass of the Grader as the human grader sees it (CONTEXT D54): its points, confidence, flags
 * and reasons; a pass without a grade has only `failureCode`.
 */
export const ManualGradingAiPassSchema = z.object({
  passNo: z.number().int().min(1).max(2),
  points: z.number().min(0).nullable(),
  confidence: z.enum(GRADING_CONFIDENCES).nullable(),
  flags: z.array(z.enum(GRADING_FLAGS)),
  criteria: z.array(ManualGradingAiCriterionSchema),
  failureCode: z.string().nullable(),
});

export type ManualGradingAiPass = z.output<typeof ManualGradingAiPassSchema>;

export const ManualGradeCriterionSchema = z.object({
  index: z.number().int().min(0).max(RUBRIC_MAX_CRITERIA - 1),
  points: z.number().int().min(0).max(RUBRIC_MAX_POINTS),
});

export type ManualGradeCriterion = z.output<typeof ManualGradeCriterionSchema>;

/** The grade a human grader gave; shown read only once the answer is graded. */
export const ManualGradeSchema = z.object({
  criteria: z.array(ManualGradeCriterionSchema),
  note: z.string().nullable(),
  finalScore: z.number().min(0),
  gradedAt: instant,
});

/**
 * One flat object rather than a union, so the API's DTO can be built from it. A whitelist (BR-03):
 * no student id, code, name or profile field; the answer text is data, shown as plain text.
 */
export const ManualGradingDetailSchema = z.object({
  answerId: id,
  sessionId: id,
  /** `exam_answers.row_version` to send back with the grade (AD-8, LESSONS §25). */
  rowVersion: RowVersionSchema,
  jdTitle: z.string(),
  companyName: z.string(),
  questionNo: z.number().int().positive(),
  skill: z.string(),
  stem: z.string(),
  rubric: z.array(ManualGradingRubricCriterionSchema).min(1),
  maxPoints: z.number().int().positive(),
  sampleAnswer: z.string().nullable(),
  answerText: z.string(),
  reasons: reasons.min(1),
  aiPasses: z.array(ManualGradingAiPassSchema),
  /** Null while the answer waits for a grader. */
  manualGrade: ManualGradeSchema.nullable(),
});

export type ManualGradingDetail = z.output<typeof ManualGradingDetailSchema>;

// --- PUT /api/exam-answers/{id}/manual-grade (AC-3) ------------------------------------------------

/**
 * Body of the grade. The shape only: the service checks the criteria against the question's rubric
 * with `manualGradeCriteriaSchemaFor`, which the form uses too.
 */
export const ManualGradeRequestSchema = z.object({
  rowVersion: RowVersionSchema,
  criteria: z.array(ManualGradeCriterionSchema).min(1).max(RUBRIC_MAX_CRITERIA),
  note: optionalText('Ghi chú', MANUAL_GRADE_NOTE_MAX),
});

export type ManualGradeRequest = z.output<typeof ManualGradeRequestSchema>;

const pointsOf = (maxPoints: number) =>
  z
    .int({ error: (issue) => (issue.expected === 'int' ? 'Điểm phải là số nguyên' : 'Nhập điểm cho tiêu chí này') })
    .min(0, { error: 'Điểm không được âm' })
    .max(maxPoints, { error: `Tối đa ${maxPoints} điểm` });

/**
 * The criteria of a grade against the question's rubric (CONTEXT D54): one per rubric criterion, in
 * rubric order, each a whole number from 0 to its `max_points`. A tuple rather than a refinement,
 * so every criterion's error shows at once (LESSONS §10); issues are at `N.points` (`N.index` when
 * out of order), and at the tuple itself when criteria are missing or extra.
 */
export function manualGradeCriteriaSchemaFor(
  rubric: QuestionRubric,
): z.ZodType<ManualGradeCriterion[], ManualGradeCriterion[]> {
  const items = rubric.map((criterion, index) =>
    z.object({
      index: z.literal(index, { error: `Tiêu chí ${index + 1} không đúng thứ tự của rubric` }),
      points: pointsOf(criterion.max_points),
    }),
  );
  // Typed as a list for its callers: a tuple built from the rubric has no static length.
  return z.tuple(items as [(typeof items)[number], ...(typeof items)[number][]], {
    error: `Phải chấm đủ ${rubric.length} tiêu chí của rubric`,
  });
}

/** The grading form: the criteria against the rubric and an optional note. */
export function manualGradeFormSchemaFor(rubric: QuestionRubric) {
  return z.object({
    criteria: manualGradeCriteriaSchemaFor(rubric),
    note: optionalText('Ghi chú', MANUAL_GRADE_NOTE_MAX),
  });
}

/**
 * What saving the grade did to the session's results (AC-5):
 * - PUBLISHED: it was the last answer waiting; S_test and S_final are computed and published;
 * - AFTER_TESTING_END: every answer is graded, the grading sweep publishes after `testing_end`;
 * - WAITING_OTHER_ANSWERS: another answer of the session still waits for a grader;
 * - NEXT_SWEEP: the publication failed or conflicted; the grade is kept, the sweep tries again.
 */
export const MANUAL_GRADE_PUBLICATIONS = ['PUBLISHED', 'AFTER_TESTING_END', 'WAITING_OTHER_ANSWERS', 'NEXT_SWEEP'] as const;

export type ManualGradePublication = (typeof MANUAL_GRADE_PUBLICATIONS)[number];

export const ManualGradeResultSchema = z.object({
  detail: ManualGradingDetailSchema,
  session: z.object({
    /** Answers of the session still waiting for a grader. */
    remainingAnswers: count,
    publication: z.enum(MANUAL_GRADE_PUBLICATIONS),
  }),
});

export type ManualGradeResult = z.output<typeof ManualGradeResultSchema>;
