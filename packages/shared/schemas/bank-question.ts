import { z } from 'zod';
import { QUESTION_DIFFICULTIES, type QuestionType } from '../contracts/exam-blueprint.js';
import { QUESTION_REJECT_REASONS, QUESTION_VALIDATION_STATUSES, type QuestionRejectReason } from '../contracts/questions.js';
import { QUESTION_BANK_STATES } from '../states/question-bank.js';
import { CellCoverageSchema } from './exam-blueprint.js';
import { RowVersionSchema } from './common.js';
import { SampleQuestionSchema } from './question-review.js';

// Every question of a JD's bank as CENTER reads it, and CENTER rejecting a wrong one by hand
// (FR-18, US-4.11, CONTEXT D60). Answer keys and rubrics go to CENTER only; no student route ever
// returns them (AGENTS › Invariant 8).

/**
 * Who wrote a question (US-4.13 AC-8, CONTEXT D62): the Test Generator, or CENTER or HR by hand. A
 * question written by hand has no draft, model or prompt (Invariant 12 is about LLM output only).
 */
export const QUESTION_SOURCES = ['AI', 'MANUAL'] as const;

export type QuestionSource = (typeof QUESTION_SOURCES)[number];

/** Roles that may add questions by hand (US-4.13 AC-1). */
export const QUESTION_AUTHOR_ROLES = ['CENTER', 'HR'] as const;

/** The account that added a question by hand. */
export const QuestionCreatorSchema = z.object({
  id: z.int().positive(),
  /** Full name, or the email of an account without one. */
  name: z.string(),
  role: z.enum(QUESTION_AUTHOR_ROLES),
});

export type QuestionCreator = z.output<typeof QuestionCreatorSchema>;

/**
 * Why CENTER rejects a question: the Validator's reasons (US-4.2 AC-3) but its refusal, which only
 * the model gives. The same codes, so the Test Generator reads both kinds of rejection alike.
 */
export const MANUAL_QUESTION_REJECT_REASONS = [
  'ANSWER_MISMATCH',
  'MULTIPLE_CORRECT',
  'OFF_SKILL',
  'ANSWER_LEAKED',
  'WEAK_DISTRACTORS',
  'UNCLEAR',
  'RUBRIC_MISMATCH',
  'DIFFICULTY_MISMATCH',
  'DUPLICATE',
] as const satisfies readonly Exclude<QuestionRejectReason, 'VALIDATOR_REFUSAL'>[];

export type ManualQuestionRejectReason = (typeof MANUAL_QUESTION_REJECT_REASONS)[number];

/**
 * Reasons the Validator gives one question type only: the answer key and the distractors of a
 * multiple-choice question, the rubric of an essay. The Test Generator reads CENTER's reason as the
 * Validator's, so a reason of the other type would mislead its next run.
 */
const REASONS_OF_OTHER_TYPE: Readonly<Record<QuestionType, readonly ManualQuestionRejectReason[]>> = {
  MCQ: ['RUBRIC_MISMATCH'],
  ESSAY: ['ANSWER_MISMATCH', 'MULTIPLE_CORRECT', 'WEAK_DISTRACTORS'],
};

/** The reasons CENTER may reject a question of this type for, in the order of the Validator's. */
export const manualRejectReasonsFor = (type: QuestionType): readonly ManualQuestionRejectReason[] =>
  MANUAL_QUESTION_REJECT_REASONS.filter((reason) => !REASONS_OF_OTHER_TYPE[type].includes(reason));

/** Longest note CENTER may add to a rejection. */
export const QUESTION_REJECT_NOTE_MAX = 1_000;

/**
 * `questions.manual_rejection`: who rejected the question by hand, when and why. Set with the
 * status, REJECTED before locking or RETIRED after (US-4.11 AC-3), and never changed afterwards.
 */
export interface ManualQuestionRejection {
  reason: ManualQuestionRejectReason;
  note: string | null;
  /** `users.id` of the CENTER account. */
  rejected_by: number;
  rejected_at: string;
}

/** The Validator's verdict on a question, when CENTER ran it (US-4.10). */
export const QuestionAiCheckSchema = z.object({
  status: z.enum(QUESTION_VALIDATION_STATUSES),
  reasons: z.array(z.enum(QUESTION_REJECT_REASONS)),
  /** Options the Validator found right, solving without the key; null for an essay or a refusal. */
  correctOptions: z.array(z.int().min(0)).nullable(),
  estimatedDifficulty: z.enum(QUESTION_DIFFICULTIES).nullable(),
  note: z.string().nullable(),
  model: z.string(),
  promptVersion: z.string(),
});

export type QuestionAiCheck = z.output<typeof QuestionAiCheckSchema>;

export const QuestionManualRejectionSchema = z.object({
  reason: z.enum(MANUAL_QUESTION_REJECT_REASONS),
  note: z.string().nullable(),
  rejectedBy: z.object({
    id: z.int().positive(),
    /** Full name, or the email of an account without one. */
    name: z.string(),
  }),
  rejectedAt: z.iso.datetime(),
});

export type QuestionManualRejection = z.output<typeof QuestionManualRejectionSchema>;

/**
 * One question of the bank, whatever its status (US-4.11 AC-1): what a sample question shows, the
 * Validator's verdict, CENTER's rejection, and who wrote it: the model and prompt of an AI question
 * (Invariant 12), the account of one added by hand (US-4.13 AC-7).
 */
export const BankQuestionSchema = SampleQuestionSchema.omit({ review: true }).extend({
  /** In a cell of the current blueprint: an exam draws no question of a skill the JD dropped. */
  inBlueprint: z.boolean(),
  aiCheck: QuestionAiCheckSchema.nullable(),
  manualRejection: QuestionManualRejectionSchema.nullable(),
  source: z.enum(QUESTION_SOURCES),
  /** Null for an AI question. */
  createdBy: QuestionCreatorSchema.nullable(),
  /** Null for a question added by hand. */
  model: z.string().nullable(),
  promptVersion: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export type BankQuestion = z.output<typeof BankQuestionSchema>;

/** Body of `GET /api/question-banks/{id}/questions`. */
export const BankQuestionListSchema = z.object({
  bankId: z.int().positive(),
  jdId: z.int().positive(),
  status: z.enum(QUESTION_BANK_STATES),
  /** Raised by each question retired after locking (US-4.2 AC-7). */
  version: z.int().positive(),
  /** Part A first, then part B; by cell of the blueprint, then the oldest question first. */
  questions: z.array(BankQuestionSchema),
});

export type BankQuestionList = z.output<typeof BankQuestionListSchema>;

const REASON_REQUIRED = 'Chọn lý do loại câu';

/** The "Loại câu" form: a reason and an optional note, checked as the API checks them. */
export const RejectQuestionFormSchema = z.object({
  reason: z.enum(MANUAL_QUESTION_REJECT_REASONS, { error: REASON_REQUIRED }),
  note: z
    .string()
    .trim()
    .max(QUESTION_REJECT_NOTE_MAX, { error: `Ghi chú tối đa ${QUESTION_REJECT_NOTE_MAX} ký tự` })
    .optional(),
});

export type RejectQuestionForm = z.output<typeof RejectQuestionFormSchema>;

/**
 * Body of `POST /api/questions/{id}/reject` (US-4.11 AC-3): with the question's `rowVersion` from
 * when CENTER opened the dialog (LESSONS §25). An empty note is stored as none.
 */
export const RejectQuestionRequestSchema = RejectQuestionFormSchema.extend({ rowVersion: RowVersionSchema });

export type RejectQuestionRequest = z.output<typeof RejectQuestionRequestSchema>;

/**
 * What a rejection did: REJECTED in an open bank, RETIRED in a locked one, whose `version` rose by
 * one; and the question's cell as it stands now, null when the blueprint no longer has the cell.
 */
export const RejectQuestionResultSchema = z.object({
  questionId: z.int().positive(),
  status: z.enum(['REJECTED', 'RETIRED']),
  rowVersion: z.int().min(0),
  bank: z.object({
    id: z.int().positive(),
    status: z.enum(QUESTION_BANK_STATES),
    version: z.int().positive(),
  }),
  cell: CellCoverageSchema.nullable(),
});

export type RejectQuestionResult = z.output<typeof RejectQuestionResultSchema>;
