import { z } from 'zod';
import {
  EXAM_PARTS,
  ExamBlueprintSchema,
  type ExamPart,
  QUESTION_DIFFICULTIES,
  QUESTION_TYPES,
  type QuestionDifficulty,
} from '../contracts/exam-blueprint.js';
import { type JdRequirements, JdRequirementsSchema, skillKey } from '../contracts/jd.js';
import { MissingCellSchema, type RubricCriterion } from '../contracts/questions.js';
import { RowVersionSchema } from './common.js';

// Exam blueprint and question bank of a JD as CENTER sees and edits them (BR-05, PRD GĐ5, US-4.1,
// CONTEXT D49). The defaults are named constants, not campaign parameters (D49).

/**
 * Default blueprint (PRD GĐ5): part A 20 multiple-choice questions over the must-have skills by
 * weight, split by difficulty 40/45/15; part B 2 medium essays on the 2 heaviest skills; 60/40.
 */
export const EXAM_BLUEPRINT_DEFAULTS = {
  A: { questionCount: 20, weightPercent: 60 },
  B: { questionCount: 2, weightPercent: 40, difficulty: 'MEDIUM', skills: 2 },
  difficultyPercent: { EASY: 40, MEDIUM: 45, HARD: 15 },
} as const satisfies {
  A: { questionCount: number; weightPercent: number };
  B: { questionCount: number; weightPercent: number; difficulty: QuestionDifficulty; skills: number };
  difficultyPercent: Record<QuestionDifficulty, number>;
};

/** Part B holds 2–3 essays (PRD GĐ5). */
export const ESSAY_QUESTIONS = { min: 2, max: 3 } as const;

const DIFFICULTY_LABELS: Readonly<Record<QuestionDifficulty, string>> = { EASY: 'Dễ', MEDIUM: 'Trung bình', HARD: 'Khó' };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const intOrNull = (value: unknown): number | null => (Number.isInteger(value) ? (value as number) : null);

/**
 * The rules that tie a blueprint to the JD (AC-2), read defensively: they also run while a field
 * of the blueprint itself is invalid (LESSONS §10). Zod 4 does not ask `when` once a field of a
 * nested object fails (a cell's count, a part's weight), so those hide these rules until fixed.
 */
function checkBlueprint(value: unknown, known: ReadonlySet<string>, ctx: z.RefinementCtx): void {
  const parts = isObject(value) && isObject(value.parts) ? value.parts : null;
  if (parts === null) return;
  for (const part of EXAM_PARTS) checkPart(part, parts[part], known, ctx);

  const weights = EXAM_PARTS.map((part) => intOrNull(isObject(parts[part]) ? parts[part].weight_percent : null));
  if (weights.every((weight) => weight !== null) && weights.reduce((sum, weight) => sum + weight, 0) !== 100) {
    ctx.addIssue({ code: 'custom', path: ['parts', 'B', 'weight_percent'], message: 'Tỷ trọng hai phần cộng lại phải bằng 100%' });
  }

  const essays = isObject(parts.B) ? intOrNull(parts.B.question_count) : null;
  if (essays !== null && (essays < ESSAY_QUESTIONS.min || essays > ESSAY_QUESTIONS.max)) {
    ctx.addIssue({
      code: 'custom',
      path: ['parts', 'B', 'question_count'],
      message: `Phần B có từ ${ESSAY_QUESTIONS.min} đến ${ESSAY_QUESTIONS.max} câu tự luận`,
    });
  }
}

function checkPart(part: ExamPart, value: unknown, known: ReadonlySet<string>, ctx: z.RefinementCtx): void {
  if (!isObject(value) || !Array.isArray(value.cells)) return;
  const cells: unknown[] = value.cells;
  const seen = new Set<string>();
  let sum: number | null = 0;
  cells.forEach((cell, index) => {
    const count = isObject(cell) ? intOrNull(cell.count) : null;
    sum = sum === null || count === null ? null : sum + count;
    if (!isObject(cell) || typeof cell.skill !== 'string') return;
    const key = skillKey(cell.skill);
    if (key === '') return;
    const path = ['parts', part, 'cells', index, 'skill'];
    if (!known.has(key)) {
      ctx.addIssue({ code: 'custom', path, message: `Kỹ năng "${cell.skill.trim()}" không có trong yêu cầu của JD` });
      return;
    }
    const difficulty = (QUESTION_DIFFICULTIES as readonly unknown[]).includes(cell.difficulty)
      ? (cell.difficulty as QuestionDifficulty)
      : null;
    if (difficulty === null) return;
    const cellKey = `${key}\u0000${difficulty}`;
    if (seen.has(cellKey)) {
      ctx.addIssue({
        code: 'custom',
        path,
        message: `Ô "${cell.skill.trim()}" – ${DIFFICULTY_LABELS[difficulty]} bị trùng`,
      });
    }
    seen.add(cellKey);
  });
  const questionCount = intOrNull(value.question_count);
  if (sum !== null && questionCount !== null && sum !== questionCount) {
    ctx.addIssue({
      code: 'custom',
      path: ['parts', part, 'question_count'],
      message: `Tổng số câu của các ô (${sum}) phải bằng số câu của phần (${questionCount})`,
    });
  }
}

// Runs unless the blueprint itself is missing or not an object, while Zod asks (LESSONS §10).
const whenBlueprintIsObject = {
  when: (payload: z.core.ParsePayload) => payload.issues.every((issue) => (issue.path?.length ?? 0) > 0),
};

/**
 * The blueprint CENTER saves for a JD (AC-2): the contract's shape, plus the cells of each part
 * add up to its question count, the weights to 100, part B holds 2–3 essays, every skill is one of
 * the JD's requirements (by `skillKey`) and no cell repeats. The API and the form use the same one.
 */
export function examBlueprintRequestSchema(requirements: Pick<JdRequirements, 'must_have' | 'nice_to_have'>) {
  const known = new Set([...requirements.must_have, ...requirements.nice_to_have].map((item) => skillKey(item.skill)));
  return ExamBlueprintSchema.superRefine((value, ctx) => checkBlueprint(value, known, ctx), whenBlueprintIsObject);
}

/** Body of `PUT /api/jds/{id}/exam-blueprint`; the service checks the blueprint against the JD. */
export const UpdateExamBlueprintRequestSchema = z.object({
  rowVersion: RowVersionSchema,
  blueprint: ExamBlueprintSchema,
});

export type UpdateExamBlueprintRequest = z.output<typeof UpdateExamBlueprintRequestSchema>;

// --- Question bank and its generation runs (US-4.1 AC-3, AC-11) ------------------------------------

/** `questions.content`: what a student may see (AGENTS › Invariant 8); MCQ options in display order. */
export interface QuestionContent {
  stem: string;
  options: string[] | null;
}

/** `questions.answer_key`: never sent to a student (Invariant 8). */
export interface QuestionAnswerKey {
  /** Index in `content.options` of the correct option; null for an essay. */
  correct_option: number | null;
  explanation: string;
  /** Model answer of an essay; null for MCQ. */
  sample_answer: string | null;
}

/** `questions.rubric`, essays only. */
export type QuestionRubric = RubricCriterion[];

/** RUNNING until the result of its job; a lost result closes it FAILED with `STALE`. */
export const QUESTION_GENERATION_RUN_STATUSES = ['RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED'] as const;

export type QuestionGenerationRunStatus = (typeof QUESTION_GENERATION_RUN_STATUSES)[number];

const count = () => z.int().min(0);

/** Drafts of one blueprint cell against what it needs: `min` and `max` are the BR-05 bounds. */
export const CellCoverageSchema = z.object({
  part: z.enum(EXAM_PARTS),
  type: z.enum(QUESTION_TYPES),
  skill: z.string(),
  difficulty: z.enum(QUESTION_DIFFICULTIES),
  /** Questions of the cell in each exam. */
  needed: z.int().positive(),
  drafted: count(),
  min: z.int().positive(),
  max: z.int().positive(),
});

export type CellCoverage = z.output<typeof CellCoverageSchema>;

export const QuestionGenerationRunSchema = z.object({
  runId: z.int().positive(),
  status: z.enum(QUESTION_GENERATION_RUN_STATUSES),
  /** Cells still short of drafts when the job ended; null while it runs or when it failed whole. */
  missingCells: z.array(MissingCellSchema).nullable(),
  /** Drafts the result carried that the bank did not hold yet. */
  questionsReceived: count(),
  errorCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
});

export type QuestionGenerationRun = z.output<typeof QuestionGenerationRunSchema>;

/** Body of `GET`/`PUT /api/jds/{id}/exam-blueprint`. */
export const ExamBlueprintViewSchema = z.object({
  jdId: z.int().positive(),
  bankId: z.int().positive(),
  /** JD version the bank was made for. */
  jdVersion: z.int().positive(),
  rowVersion: z.int().min(0),
  locked: z.boolean(),
  /** Not locked and no generation running: CENTER may change the blueprint. */
  editable: z.boolean(),
  blueprint: ExamBlueprintSchema,
  /** The JD's current requirements: the skills a cell may name. */
  requirements: JdRequirementsSchema,
  coverage: z.array(CellCoverageSchema),
  /** The latest generation run; null before the first one. */
  run: QuestionGenerationRunSchema.nullable(),
});

export type ExamBlueprintView = z.output<typeof ExamBlueprintViewSchema>;
