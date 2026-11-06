import { z } from 'zod';
import { EXAM_PART_MAX_CELLS, EXAM_PART_TYPES, QuestionDifficultySchema, QuestionTypeSchema } from './exam-blueprint.js';

// Draft questions of a JD's question bank, as the Test Generator sends them back (US-4.1 AC-9,
// CONTEXT D49). Shape and limits only (LESSONS §32): the AI Service checks each question before it
// keeps it (one correct option, rubric, duplicates), so a message never fails on a business rule.

/**
 * How many drafts each cell of the blueprint needs, as multiples of the questions it draws (BR-05,
 * PRD GĐ5): at least `min` for the bank to be complete, `target` per round of generation, and no
 * more than `max`. Written to `ai-service/app/contracts/question_bank.json` for the AI Service.
 */
export const QUESTION_BANK_FACTORS = { min: 3, target: 4, max: 5 } as const;

/** Options of a multiple-choice question (PRD GĐ5). */
export const MCQ_OPTION_COUNT = 4;

/** Most criteria of an essay rubric. */
export const RUBRIC_MAX_CRITERIA = 10;

export const RUBRIC_MAX_POINTS = 100;

/** Most drafts one bank holds: two full parts at `max` with room to spare. */
export const QUESTION_BANK_MAX_DRAFTS = 1_000;

const QUESTION_TEXT_MAX = 4_000;

const text = (max: number) => z.string().trim().min(1).max(max);

const questionBase = {
  draft_id: z.int().positive().describe('ai.question_drafts.id; the backend stores each draft once by it'),
  skill: text(100).describe('Skill of the blueprint cell, as the blueprint writes it'),
  difficulty: QuestionDifficultySchema,
  stem: text(QUESTION_TEXT_MAX).describe('The question as the student reads it'),
  explanation: text(QUESTION_TEXT_MAX).describe('Why the answer is right; for staff, never sent to students'),
  model: z.string().min(1).describe('Model id that wrote the question'),
  prompt_version: z.string().min(1).describe('Versioned prompt the question was written with, e.g. test_generator/v1'),
};

export const McqOptionSchema = z
  .strictObject({
    text: text(1_000).describe('Option text'),
    correct: z.boolean().describe('Whether this option is the answer'),
  })
  .meta({ title: 'McqOption', description: 'One option of a multiple-choice question' });

export const RubricCriterionSchema = z
  .strictObject({
    criterion: text(1_000).describe('What the grader looks for'),
    max_points: z.int().positive().max(RUBRIC_MAX_POINTS).describe('Points this criterion is worth at most'),
  })
  .meta({ title: 'RubricCriterion', description: 'One criterion of an essay rubric' });

export type RubricCriterion = z.output<typeof RubricCriterionSchema>;

export const McqQuestionSchema = z
  .strictObject({
    ...questionBase,
    type: z.literal('MCQ'),
    options: z.array(McqOptionSchema).length(MCQ_OPTION_COUNT).describe('The options, in the order shown'),
  })
  .meta({ title: 'McqQuestion', description: 'A draft multiple-choice question' });

export const EssayQuestionSchema = z
  .strictObject({
    ...questionBase,
    type: z.literal('ESSAY'),
    rubric: z.array(RubricCriterionSchema).min(1).max(RUBRIC_MAX_CRITERIA).describe('Grading rubric'),
    sample_answer: text(QUESTION_TEXT_MAX).describe('A model answer; for staff and the grader, never sent to students'),
  })
  .meta({ title: 'EssayQuestion', description: 'A draft essay question' });

export const GeneratedQuestionSchema = z
  .discriminatedUnion('type', [McqQuestionSchema, EssayQuestionSchema])
  .meta({ title: 'GeneratedQuestion', description: 'A draft question of the bank, checked by the AI Service' });

export type GeneratedQuestion = z.output<typeof GeneratedQuestionSchema>;

export const MissingCellSchema = z
  .strictObject({
    type: QuestionTypeSchema,
    skill: text(100).describe('Skill of the blueprint cell'),
    difficulty: QuestionDifficultySchema,
    drafted: z.int().min(0).describe('Drafts the bank holds for the cell'),
    required: z.int().positive().describe(`Drafts the cell needs: ${QUESTION_BANK_FACTORS.min} × its count`),
  })
  .meta({ title: 'MissingCell', description: 'A blueprint cell with fewer drafts than it needs' });

export type MissingCell = z.output<typeof MissingCellSchema>;

/** Most missing cells a result lists: every cell of both parts. */
export const MISSING_CELLS_MAX = 2 * EXAM_PART_MAX_CELLS;

/** Written to `ai-service/app/contracts/question_bank.json` so Python reads the same constants. */
export function questionBankManifest() {
  return {
    factors: QUESTION_BANK_FACTORS,
    mcq_option_count: MCQ_OPTION_COUNT,
    rubric_max_criteria: RUBRIC_MAX_CRITERIA,
    max_drafts: QUESTION_BANK_MAX_DRAFTS,
    part_types: EXAM_PART_TYPES,
  };
}
