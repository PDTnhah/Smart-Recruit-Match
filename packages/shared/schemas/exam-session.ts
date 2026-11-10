import { z } from 'zod';
import { EXAM_PARTS, QUESTION_TYPES } from '../contracts/exam-blueprint.js';
import { EXAM_SESSION_STATES } from '../states/exam-session.js';
import { EXAM_RESULT_STATES } from './exam-result.js';

// The exam room of GĐ5 (FR-20, BR-05, BR-06, US-4.3, CONTEXT D51).

// --- Stored on the server only (AGENTS › Invariant 8) ---------------------------------------------

/**
 * One option of a multiple-choice question as a session shows it: the opaque code the student
 * sends back, and the option's index in `questions.content.options`. Never sent to a student.
 */
export interface ExamOptionSlot {
  code: string;
  index: number;
}

/**
 * `exam_sessions.option_layout`: the options of each multiple-choice question of the session in
 * display order, keyed by question id. Essays have no entry. Never sent to a student.
 */
export type ExamOptionLayout = Record<string, ExamOptionSlot[]>;

/**
 * `exam_answers.answer`: the code a student picked with the original index it stands for, which
 * grading reads (US-4.4), or the text of an essay. The index never leaves the server.
 */
export type ExamStoredAnswer = { code: string; option: number } | { text: string };

// --- API of the exam room (AC-1, AC-3, AC-6–AC-8, AC-14) -----------------------------------------
//
// Responses are whitelists (AGENTS › Invariant 8): the serializer keeps only the keys below, so an
// answer key, a rubric, an explanation or the original index of an option never reaches a student.

const id = z.number().int().positive();
const instant = z.iso.datetime({ offset: true });

/** Longest essay answer, in characters. */
export const EXAM_ESSAY_MAX_LENGTH = 5000;

/** Most answers one autosave may carry. */
export const EXAM_SAVE_MAX_ANSWERS = 50;

/** An option as the student sees it: an opaque code of this session, never its original place. */
export const ExamOptionSchema = z.object({
  code: z.string(),
  text: z.string(),
});

export type ExamOption = z.output<typeof ExamOptionSchema>;

/** One question of the paper, in display order; `no` counts from 1 across both parts. */
export const ExamQuestionSchema = z.object({
  questionId: id,
  no: z.number().int().positive(),
  part: z.enum(EXAM_PARTS),
  type: z.enum(QUESTION_TYPES),
  stem: z.string(),
  /** MCQ options in this session's order; null for an essay. */
  options: z.array(ExamOptionSchema).nullable(),
});

export type ExamQuestion = z.output<typeof ExamQuestionSchema>;

/** An answer as the student gives it: the code of an option, or the text of an essay. */
export const ExamAnswerValueSchema = z.union([
  z.strictObject({ optionCode: z.string().min(1).max(16) }),
  z.strictObject({ text: z.string().max(EXAM_ESSAY_MAX_LENGTH, { error: `Câu trả lời tối đa ${EXAM_ESSAY_MAX_LENGTH} ký tự` }) }),
]);

export type ExamAnswerValue = z.output<typeof ExamAnswerValueSchema>;

export const ExamSavedAnswerSchema = z.object({
  questionId: id,
  answer: ExamAnswerValueSchema,
});

export type ExamSavedAnswer = z.output<typeof ExamSavedAnswerSchema>;

/**
 * `POST /api/preferences/{id}/exam/start` and `GET /api/exam-sessions/{id}`: the paper with the
 * answers saved so far, while the session is IN_PROGRESS. A closed session shows no questions.
 * `serverNow` lets the client count down from the server's clock (AGENTS › Invariant 8).
 */
export const ExamPaperSchema = z.object({
  sessionId: id,
  status: z.enum(EXAM_SESSION_STATES),
  startedAt: instant,
  /** Server-decided; never later than `testing_end` (CONTEXT D51). */
  deadlineAt: instant,
  submittedAt: instant.nullable(),
  serverNow: instant,
  questions: z.array(ExamQuestionSchema),
  answers: z.array(ExamSavedAnswerSchema),
});

export type ExamPaper = z.output<typeof ExamPaperSchema>;

const distinctQuestions = (answers: readonly { questionId: number }[]) =>
  new Set(answers.map((answer) => answer.questionId)).size === answers.length;

/**
 * Body of `PUT /api/exam-sessions/{id}/answers` (AC-6): the answers that changed since the last
 * save; `null` clears one. The same body sent twice leaves the same answers.
 */
export const SaveExamAnswersRequestSchema = z.strictObject({
  answers: z
    .array(z.strictObject({ questionId: id, answer: ExamAnswerValueSchema.nullable() }))
    .min(1)
    .max(EXAM_SAVE_MAX_ANSWERS)
    .refine(distinctQuestions, { error: 'Mỗi câu chỉ gửi một lần' }),
});

export type SaveExamAnswersRequest = z.output<typeof SaveExamAnswersRequestSchema>;

/** The answers are saved; the deadline comes back with the server's clock. */
export const SaveExamAnswersResultSchema = z.object({
  deadlineAt: instant,
  serverNow: instant,
});

export type SaveExamAnswersResult = z.output<typeof SaveExamAnswersResultSchema>;

/** `POST /api/exam-sessions/{id}/submit` (AC-8): the same body however many times it is sent. */
export const ExamSubmissionSchema = z.object({
  sessionId: id,
  status: z.enum(['SUBMITTED', 'EXPIRED']),
  submittedAt: instant,
  answeredCount: z.number().int().min(0),
  questionCount: z.number().int().positive(),
});

export type ExamSubmission = z.output<typeof ExamSubmissionSchema>;

/**
 * Where the test of a preference stands (AC-14): not started yet, the session's state, or CLOSED
 * when the preference left PENDING_TEST without a session (e.g. not taken by `testing_end`).
 */
export const MY_EXAM_STATUSES = ['NOT_STARTED', ...EXAM_SESSION_STATES, 'CLOSED'] as const;

export type MyExamStatus = (typeof MY_EXAM_STATUSES)[number];

export const MyExamItemSchema = z.object({
  preferenceId: id,
  rank: z.number().int().positive(),
  jdId: id,
  jdTitle: z.string(),
  companyName: z.string(),
  examStatus: z.enum(MY_EXAM_STATUSES),
  sessionId: id.nullable(),
  /** Known once the JD's question bank is locked. */
  durationMinutes: z.number().int().positive().nullable(),
  questionCount: z.number().int().positive().nullable(),
  deadlineAt: instant.nullable(),
  submittedAt: instant.nullable(),
  /** Whether `POST /api/preferences/{id}/exam/start` would start a session now. */
  canStart: z.boolean(),
  /**
   * Seconds the student would have if they started now: T_test, or less when `testing_end` comes
   * first (CONTEXT D51). Null unless `canStart`.
   */
  secondsIfStartedNow: z.number().int().min(0).nullable(),
  /**
   * Where the results of the closed session stand (US-4.4 AC-12): GRADING until they are
   * published, then PUBLISHED. Null without a closed session.
   */
  resultState: z.enum(EXAM_RESULT_STATES).nullable(),
});

export type MyExamItem = z.output<typeof MyExamItemSchema>;

/** `GET /api/me/exams`: the preferences of the student's latest campaign, NV1 first. */
export const MyExamsResponseSchema = z.object({
  campaign: z
    .object({
      id,
      name: z.string(),
      testingEnd: instant.nullable(),
      /** The campaign is in TESTING and `testing_end` has not passed. */
      testingOpen: z.boolean(),
    })
    .nullable(),
  items: z.array(MyExamItemSchema),
  serverNow: instant,
});

export type MyExamsResponse = z.output<typeof MyExamsResponseSchema>;
