import { z } from 'zod';
import { QUESTION_DIFFICULTIES, QUESTION_TYPES, type QuestionDifficulty, type QuestionType } from '../contracts/exam-blueprint.js';
import {
  MCQ_OPTION_COUNT,
  QUESTION_PART_TEXT_MAX,
  QUESTION_SKILL_MAX,
  QUESTION_TEXT_MAX,
  RUBRIC_MAX_CRITERIA,
  RUBRIC_MAX_POINTS,
} from '../contracts/questions.js';
import { QUESTION_BANK_STATES } from '../states/question-bank.js';
import { MANUAL_QUESTION_REJECT_REASONS, QuestionCreatorSchema } from './bank-question.js';
import { whenValid } from './common.js';
import type { CellCoverage } from './exam-blueprint.js';
import { SampleQuestionSchema } from './question-review.js';

// CENTER and HR adding their own questions to a JD's bank, one by one or from a file (FR-42,
// US-4.13, CONTEXT D62). A question added by hand passes the rules the Test Generator's drafts pass
// (`submit_questions()`): the shape and limits here, the cell, room and duplicates on the server.

/** How the questions of one save came: the form, or a file after its preview. */
export const MANUAL_QUESTION_ORIGINS = ['FORM', 'IMPORT'] as const;

export type ManualQuestionOrigin = (typeof MANUAL_QUESTION_ORIGINS)[number];

/** Most questions one file, and one save, may hold. */
export const MANUAL_QUESTION_IMPORT_MAX_ROWS = 200;

/** Letters of the MCQ options, in the order the student sees them. */
export const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

const required = (label: string, max: number) =>
  z
    .string({ error: `Nhập ${label}` })
    .trim()
    .min(1, { error: `Nhập ${label}` })
    .max(max, { error: `Tối đa ${max} ký tự` });

const common = {
  skill: required('kỹ năng', QUESTION_SKILL_MAX),
  difficulty: z.enum(QUESTION_DIFFICULTIES, { error: 'Chọn độ khó' }),
  stem: required('đề', QUESTION_TEXT_MAX),
  explanation: required('giải thích', QUESTION_TEXT_MAX),
};

/** Option text as the AI Service compares it: whitespace collapsed, case kept (`boolean` ≠ `Boolean`). */
const optionKey = (text: string) => text.split(/\s+/).filter(Boolean).join(' ');

export const ManualMcqInputSchema = z
  .object({
    type: z.literal('MCQ'),
    ...common,
    options: z
      .array(required('phương án', QUESTION_PART_TEXT_MAX), { error: 'Nhập đủ 4 phương án' })
      .length(MCQ_OPTION_COUNT, { error: 'Nhập đủ 4 phương án' }),
    /** Index in `options` of the one correct option. */
    correctOption: z
      .int({ error: 'Chọn đáp án đúng' })
      .min(0, { error: 'Chọn đáp án đúng' })
      .max(MCQ_OPTION_COUNT - 1, { error: 'Chọn đáp án đúng' }),
  })
  .superRefine((value, ctx) => {
    const seen = new Map<string, number>();
    value.options.forEach((option, index) => {
      const first = seen.get(optionKey(option));
      if (first === undefined) seen.set(optionKey(option), index);
      else {
        ctx.addIssue({
          code: 'custom',
          path: ['options', index],
          message: `Trùng với phương án ${OPTION_LETTERS[first] ?? first + 1}`,
        });
      }
    });
  }, whenValid(['options']));

export const RubricCriterionInputSchema = z.object({
  criterion: required('tiêu chí', QUESTION_PART_TEXT_MAX),
  maxPoints: z
    .int({ error: 'Điểm là số nguyên' })
    .min(1, { error: `Điểm từ 1 đến ${RUBRIC_MAX_POINTS}` })
    .max(RUBRIC_MAX_POINTS, { error: `Điểm từ 1 đến ${RUBRIC_MAX_POINTS}` }),
});

export const ManualEssayInputSchema = z.object({
  type: z.literal('ESSAY'),
  ...common,
  rubric: z
    .array(RubricCriterionInputSchema)
    .min(1, { error: 'Thêm ít nhất một tiêu chí' })
    .max(RUBRIC_MAX_CRITERIA, { error: `Tối đa ${RUBRIC_MAX_CRITERIA} tiêu chí` }),
  sampleAnswer: required('đáp án mẫu', QUESTION_TEXT_MAX),
});

/**
 * One question added by hand (US-4.13 AC-1, AC-2): its cell (type, skill, difficulty), its text, and
 * what grades it: the correct option of a multiple-choice question, the rubric and model answer of
 * an essay. The form and the API parse the same schema.
 */
export const ManualQuestionInputSchema = z.discriminatedUnion('type', [ManualMcqInputSchema, ManualEssayInputSchema], {
  error: 'Chọn loại câu',
});

export type ManualQuestionInput = z.output<typeof ManualQuestionInputSchema>;

export type ManualQuestionFormValues = z.input<typeof ManualQuestionInputSchema>;

/**
 * Why a question cannot be added (AC-2, AC-4), as `submit_questions()` refuses a draft:
 * - INVALID: a field breaks the format or a length limit of the schema;
 * - FORMULA: a cell of the file holds a formula, never computed (AC-4);
 * - UNKNOWN_CELL: type, skill and difficulty match no cell of the blueprint;
 * - CELL_FULL: the cell holds `QUESTION_BANK_FACTORS.max` × its count, rejected ones aside;
 * - BANK_FULL: the bank holds `QUESTION_BANK_MAX_DRAFTS` questions;
 * - DUPLICATE: the same stem as a question of the bank, or of a question before it in the same save.
 */
export const MANUAL_QUESTION_ISSUE_CODES = [
  'INVALID',
  'FORMULA',
  'UNKNOWN_CELL',
  'CELL_FULL',
  'BANK_FULL',
  'DUPLICATE',
] as const;

export type ManualQuestionIssueCode = (typeof MANUAL_QUESTION_ISSUE_CODES)[number];

/** One rule a question of a save breaks: `details.issues` of `400 MANUAL_QUESTIONS_INVALID`. */
export const ManualQuestionIssueSchema = z.object({
  /** Position of the question in the request's `questions`. */
  index: z.int().min(0),
  /** Path of the field in the question (`stem`, `options.2`, `rubric.0.maxPoints`); null for the question as a whole. */
  field: z.string().nullable(),
  code: z.enum(MANUAL_QUESTION_ISSUE_CODES),
  message: z.string(),
});

export type ManualQuestionIssue = z.output<typeof ManualQuestionIssueSchema>;

/**
 * Body of `POST /api/jds/{id}/question-bank/questions` (AC-1, AC-5): one question from the form, or
 * every row of a file once its preview had no error. The server checks them all again under the
 * bank's lock, and saves them all or none.
 */
export const SaveManualQuestionsRequestSchema = z.object({
  origin: z.enum(MANUAL_QUESTION_ORIGINS),
  /** Name of the imported file, for the audit log; display only. */
  fileName: z.string().trim().min(1).max(255).optional(),
  questions: z
    .array(ManualQuestionInputSchema)
    .min(1, { error: 'Thêm ít nhất một câu' })
    .max(MANUAL_QUESTION_IMPORT_MAX_ROWS, { error: `Tối đa ${MANUAL_QUESTION_IMPORT_MAX_ROWS} câu một lần` }),
});

export type SaveManualQuestionsRequest = z.output<typeof SaveManualQuestionsRequestSchema>;

export const SaveManualQuestionsResultSchema = z.object({
  bankId: z.int().positive(),
  /** Ids of the new questions, in the order of the request. */
  questionIds: z.array(z.int().positive()),
});

export type SaveManualQuestionsResult = z.output<typeof SaveManualQuestionsResultSchema>;

// The import file (AC-3, AC-4): one set of columns for both types, Vietnamese labels.

/** Formats of the import file and of its template. */
export const QUESTION_IMPORT_FORMATS = ['xlsx', 'csv'] as const;

export type QuestionImportFormat = (typeof QUESTION_IMPORT_FORMATS)[number];

export const QuestionImportTemplateQuerySchema = z.object({
  format: z.enum(QUESTION_IMPORT_FORMATS).default('xlsx'),
});

export type QuestionImportTemplateQuery = z.output<typeof QuestionImportTemplateQuerySchema>;

/** Cell values of the "Loại" column. */
export const QUESTION_IMPORT_TYPE_LABELS: Readonly<Record<QuestionType, string>> = {
  MCQ: 'Trắc nghiệm',
  ESSAY: 'Tự luận',
};

/** Cell values of the "Độ khó" column. */
export const QUESTION_IMPORT_DIFFICULTY_LABELS: Readonly<Record<QuestionDifficulty, string>> = {
  EASY: 'Dễ',
  MEDIUM: 'Trung bình',
  HARD: 'Khó',
};

/** Headers of the columns every question uses, by field. */
export const QUESTION_IMPORT_COLUMNS = {
  type: 'Loại',
  skill: 'Kỹ năng',
  difficulty: 'Độ khó',
  stem: 'Đề',
  options: OPTION_LETTERS.map((letter) => `Phương án ${letter}`),
  correctOption: 'Đáp án đúng',
  explanation: 'Giải thích',
  sampleAnswer: 'Đáp án mẫu',
} as const;

/** Header of the criterion and of the points of rubric criterion `n` (from 1). */
export const rubricImportColumns = (n: number) => ({ criterion: `Tiêu chí ${n}`, points: `Điểm ${n}` });

/** Every header of the template, in its order (AC-3). */
export const QUESTION_IMPORT_HEADERS: readonly string[] = [
  QUESTION_IMPORT_COLUMNS.type,
  QUESTION_IMPORT_COLUMNS.skill,
  QUESTION_IMPORT_COLUMNS.difficulty,
  QUESTION_IMPORT_COLUMNS.stem,
  ...QUESTION_IMPORT_COLUMNS.options,
  QUESTION_IMPORT_COLUMNS.correctOption,
  QUESTION_IMPORT_COLUMNS.explanation,
  QUESTION_IMPORT_COLUMNS.sampleAnswer,
  ...Array.from({ length: RUBRIC_MAX_CRITERIA }, (_, i) => Object.values(rubricImportColumns(i + 1))).flat(),
];

/**
 * Why a whole file is refused (AC-4): `details.reason` of `400 QUESTION_IMPORT_FILE_INVALID`. Not an
 * `.xlsx` or a UTF-8 `.csv`; unreadable; a header of the template missing; no question; more than
 * MANUAL_QUESTION_IMPORT_MAX_ROWS questions.
 */
export const QUESTION_IMPORT_FILE_ERRORS = [
  'UNSUPPORTED_TYPE',
  'UNREADABLE',
  'MISSING_COLUMNS',
  'NO_ROWS',
  'TOO_MANY_ROWS',
] as const;

export type QuestionImportFileError = (typeof QUESTION_IMPORT_FILE_ERRORS)[number];

/** One problem of a row of the file, at the column it is in. */
export const QuestionImportIssueSchema = z.object({
  /** Header of the template column; null for the row as a whole. */
  column: z.string().nullable(),
  code: z.enum(MANUAL_QUESTION_ISSUE_CODES),
  message: z.string(),
});

export type QuestionImportIssue = z.output<typeof QuestionImportIssueSchema>;

export const QuestionImportRowSchema = z.object({
  /** Row number in the sheet, the header being row 1. */
  row: z.int().positive(),
  /** The first columns as read, for the preview table. */
  type: z.string(),
  skill: z.string(),
  difficulty: z.string(),
  stem: z.string(),
  /** The row as a question, sent back unchanged to save it; null when its fields break the schema. */
  question: ManualQuestionInputSchema.nullable(),
  issues: z.array(QuestionImportIssueSchema),
});

export type QuestionImportRow = z.output<typeof QuestionImportRowSchema>;

/** Body of `POST /api/jds/{id}/question-bank/import/preview` (AC-4): every row checked, nothing saved. */
export const QuestionImportPreviewSchema = z.object({
  jdId: z.int().positive(),
  fileName: z.string(),
  rows: z.array(QuestionImportRowSchema),
});

export type QuestionImportPreview = z.output<typeof QuestionImportPreviewSchema>;

/** CENTER's rejection of a question as the HR who added it reads it: why, not who. */
export const ManualQuestionRejectionNoteSchema = z.object({
  reason: z.enum(MANUAL_QUESTION_REJECT_REASONS),
  note: z.string().nullable(),
  rejectedAt: z.iso.datetime(),
});

/** A question HR of the JD's company added, with its status and why CENTER rejected it, if it did (AC-7). */
export const ManualQuestionSchema = SampleQuestionSchema.omit({ review: true }).extend({
  createdBy: QuestionCreatorSchema,
  createdAt: z.iso.datetime(),
  rejection: ManualQuestionRejectionNoteSchema.nullable(),
});

export type ManualQuestion = z.output<typeof ManualQuestionSchema>;

/**
 * Questions a cell still takes (AC-2 CELL_FULL): `max` less those not rejected. A question retired
 * still holds its place, as `submit_questions()` counts it.
 */
export const cellRoom = (cell: Pick<CellCoverage, 'max' | 'drafted' | 'rejected'>): number =>
  Math.max(0, cell.max - (cell.drafted - cell.rejected));

/** A cell of the blueprint as the form offers it: HR reads no blueprint, so the list carries them. */
export const ManualQuestionCellSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  skill: z.string(),
  difficulty: z.enum(QUESTION_DIFFICULTIES),
  /** Usable questions (DRAFT, VALIDATED) the cell holds. */
  usable: z.int().min(0),
  /** Questions the cell still takes: `cellRoom`. */
  room: z.int().min(0),
});

export type ManualQuestionCell = z.output<typeof ManualQuestionCellSchema>;

/** Body of `GET /api/jds/{id}/question-bank/manual-questions` (AC-7). */
export const ManualQuestionListSchema = z.object({
  jdId: z.int().positive(),
  /** Null until the JD's bank exists. */
  bank: z
    .object({
      id: z.int().positive(),
      status: z.enum(QUESTION_BANK_STATES),
      version: z.int().positive(),
      /** The JD's requirements are newer than the blueprint: nothing is added until CENTER saves it again. */
      jdOutdated: z.boolean(),
    })
    .nullable(),
  /** The blueprint's cells, part A first; empty without a bank. */
  cells: z.array(ManualQuestionCellSchema),
  /** Oldest first. */
  questions: z.array(ManualQuestionSchema),
});

export type ManualQuestionList = z.output<typeof ManualQuestionListSchema>;
