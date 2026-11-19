import { z } from 'zod';
import { EXAM_PARTS, QUESTION_DIFFICULTIES, QUESTION_TYPES } from '../contracts/exam-blueprint.js';
import { RubricCriterionSchema } from '../contracts/questions.js';
import { QUESTION_BANK_STATES } from '../states/question-bank.js';
import { QUESTION_STATES } from '../states/question.js';
import { RowVersionSchema, whenValid } from './common.js';

// Sample review of a JD's question bank by HR or CENTER (FR-19, UC-22, US-4.9). A reviewer reads a
// random sample, stratified by the cells of the blueprint, with answer keys and rubrics, and marks
// each question right or wrong. A wrong one is retired at once. Optional: nothing waits for it.

/** What a reviewer says of one question. */
export const QUESTION_REVIEW_VERDICTS = ['OK', 'ERROR'] as const;

export type QuestionReviewVerdict = (typeof QUESTION_REVIEW_VERDICTS)[number];

/** Longest reason a reviewer may give for an ERROR. */
export const QUESTION_REVIEW_REASON_MAX = 1_000;

/** The latest review of a sample question, by anyone allowed to review the JD's bank. */
export const QuestionReviewSchema = z.object({
  verdict: z.enum(QUESTION_REVIEW_VERDICTS),
  /** Why the question is wrong; null for OK. */
  reason: z.string().nullable(),
  reviewedAt: z.iso.datetime(),
  /** Written by the caller. */
  mine: z.boolean(),
});

export type QuestionReview = z.output<typeof QuestionReviewSchema>;

/**
 * One question of the sample with what a reviewer checks it against: the correct option and its
 * explanation, or the model answer and rubric of an essay. Sent to HR and CENTER only; no student
 * route ever returns it (AGENTS › Invariant 8).
 */
export const SampleQuestionSchema = z.object({
  id: z.int().positive(),
  /** Sent back with an ERROR, which retires the question. */
  rowVersion: z.int().min(0),
  /** DRAFT and VALIDATED may be reviewed; a question retired or rejected since stays in its place. */
  status: z.enum(QUESTION_STATES),
  part: z.enum(EXAM_PARTS),
  type: z.enum(QUESTION_TYPES),
  skill: z.string(),
  difficulty: z.enum(QUESTION_DIFFICULTIES),
  stem: z.string(),
  /** MCQ options in display order; null for an essay. */
  options: z.array(z.string()).nullable(),
  /** Index in `options` of the correct one; null for an essay. */
  correctOption: z.int().min(0).nullable(),
  explanation: z.string(),
  /** Model answer of an essay; null for MCQ. */
  sampleAnswer: z.string().nullable(),
  rubric: z.array(RubricCriterionSchema).nullable(),
  review: QuestionReviewSchema.nullable(),
});

export type SampleQuestion = z.output<typeof SampleQuestionSchema>;

/** Body of `GET /api/jds/{id}/question-bank/sample` and of a review. */
export const QuestionReviewSampleSchema = z.object({
  jdId: z.int().positive(),
  /** Null until the JD's bank exists. */
  bank: z
    .object({
      id: z.int().positive(),
      status: z.enum(QUESTION_BANK_STATES),
      /** Raised by each question retired after locking (US-4.2 AC-7). */
      version: z.int().positive(),
    })
    .nullable(),
  /** `campaigns.config.bank_review_sample_size`: the most questions the sample holds. */
  sampleSize: z.int().positive(),
  /** Part A first, then part B; empty while the bank has no usable question. */
  questions: z.array(SampleQuestionSchema),
});

export type QuestionReviewSample = z.output<typeof QuestionReviewSampleSchema>;

const REASON_REQUIRED = 'Nêu lý do câu hỏi sai';

/** Why a question is wrong: required with an ERROR. */
const ReviewReasonSchema = z
  .string({ error: REASON_REQUIRED })
  .trim()
  .max(QUESTION_REVIEW_REASON_MAX, { error: `Lý do tối đa ${QUESTION_REVIEW_REASON_MAX} ký tự` });

/**
 * Body of `POST /api/jds/{id}/question-bank/sample/reviews`: one question of the sample. An ERROR
 * needs a reason, and the question's `rowVersion` from when the reviewer opened it (LESSONS §25),
 * since it retires the question; an OK needs neither and its reason is dropped.
 */
export const SubmitQuestionReviewRequestSchema = z
  .object({
    questionId: z.int({ error: 'Chọn một câu của mẫu' }).positive({ error: 'Chọn một câu của mẫu' }),
    verdict: z.enum(QUESTION_REVIEW_VERDICTS, { error: 'Chọn Đúng hoặc Báo lỗi' }),
    reason: ReviewReasonSchema.optional(),
    rowVersion: RowVersionSchema.optional(),
  })
  .superRefine(
    (value, ctx) => {
      if (value.verdict !== 'ERROR') return;
      if (!value.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: REASON_REQUIRED });
      if (value.rowVersion === undefined) {
        ctx.addIssue({ code: 'custom', path: ['rowVersion'], message: 'Tải lại mẫu rồi báo lỗi lại' });
      }
    },
    whenValid(['verdict', 'reason', 'rowVersion']),
  );

export type SubmitQuestionReviewRequest = z.output<typeof SubmitQuestionReviewRequestSchema>;

/** The "Báo lỗi" form: the reason alone, checked as the API checks it. */
export const QuestionErrorReportFormSchema = z.object({
  reason: ReviewReasonSchema.min(1, { error: REASON_REQUIRED }),
});

export type QuestionErrorReportForm = z.output<typeof QuestionErrorReportFormSchema>;
