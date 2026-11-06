import { z } from 'zod';

// Exam blueprint of a JD (BR-05, PRD GĐ5, US-4.1, CONTEXT D49): part A multiple choice, part B
// essays, each a list of skill × difficulty cells. Snake case because the AI Service reads it
// through core.v_ai_question_banks. Shape and limits only (LESSONS §32): the rules that tie it to
// the JD's requirements live in `examBlueprintRequestSchema` (packages/shared/schemas).

/** Dễ / Trung bình / Khó (PRD GĐ5). */
export const QUESTION_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;

export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];

/** MCQ = trắc nghiệm 4 phương án, ESSAY = tự luận chấm theo rubric. */
export const QUESTION_TYPES = ['MCQ', 'ESSAY'] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Parts of the exam; part C is not part of the system (Q7, CONTEXT D49). */
export const EXAM_PARTS = ['A', 'B'] as const;

export type ExamPart = (typeof EXAM_PARTS)[number];

/** The question type of each part. */
export const EXAM_PART_TYPES = { A: 'MCQ', B: 'ESSAY' } as const satisfies Record<ExamPart, QuestionType>;

/** The part a question type is drawn for. */
export const EXAM_PART_OF_TYPE = { MCQ: 'A', ESSAY: 'B' } as const satisfies Record<QuestionType, ExamPart>;

/** Most questions one part draws. */
export const EXAM_PART_MAX_QUESTIONS = 60;

/** Most cells of one part: every skill of both requirement groups × 3 difficulties. */
export const EXAM_PART_MAX_CELLS = 180;

export const EXAM_MAX_DURATION_MINUTES = 600;

export const QuestionDifficultySchema = z
  .enum(QUESTION_DIFFICULTIES, { error: 'Chọn độ khó' })
  .meta({ title: 'QuestionDifficulty', description: 'EASY, MEDIUM or HARD (PRD GĐ5)' });

export const QuestionTypeSchema = z
  .enum(QUESTION_TYPES)
  .meta({ title: 'QuestionType', description: 'MCQ: 4 options, one correct; ESSAY: graded by rubric' });

export const BlueprintCellSchema = z
  .strictObject({
    skill: z
      .string({ error: 'Vui lòng nhập kỹ năng' })
      .trim()
      .min(1, { error: 'Vui lòng nhập kỹ năng' })
      .max(100, { error: 'Kỹ năng tối đa 100 ký tự' })
      .describe('Skill name as the JD requirements write it'),
    difficulty: QuestionDifficultySchema,
    count: z
      .int({ error: 'Số câu phải là số nguyên' })
      .min(1, { error: 'Số câu ít nhất là 1' })
      .max(EXAM_PART_MAX_QUESTIONS, { error: `Số câu tối đa ${EXAM_PART_MAX_QUESTIONS}` })
      .describe('Questions of this skill and difficulty drawn for each exam'),
  })
  .meta({ title: 'BlueprintCell', description: 'Questions of one skill and difficulty drawn for each exam' });

export type BlueprintCell = z.output<typeof BlueprintCellSchema>;

export const ExamPartBlueprintSchema = z
  .strictObject({
    weight_percent: z
      .int({ error: 'Tỷ trọng phải là số nguyên' })
      .min(0, { error: 'Tỷ trọng từ 0 đến 100' })
      .max(100, { error: 'Tỷ trọng từ 0 đến 100' })
      .describe('Share of the part in S_test, in percent; the parts add up to 100'),
    question_count: z
      .int({ error: 'Số câu phải là số nguyên' })
      .min(1, { error: 'Số câu ít nhất là 1' })
      .max(EXAM_PART_MAX_QUESTIONS, { error: `Số câu tối đa ${EXAM_PART_MAX_QUESTIONS}` })
      .describe('Questions of the part in each exam; the counts of its cells add up to it'),
    cells: z
      .array(BlueprintCellSchema)
      .min(1, { error: 'Cần ít nhất một ô' })
      .max(EXAM_PART_MAX_CELLS, { error: `Tối đa ${EXAM_PART_MAX_CELLS} ô` })
      .describe('Skill × difficulty cells, each once'),
  })
  .meta({ title: 'ExamPartBlueprint', description: 'One part of the exam blueprint' });

export type ExamPartBlueprint = z.output<typeof ExamPartBlueprintSchema>;

export const ExamBlueprintSchema = z
  .strictObject({
    duration_minutes: z
      .int({ error: 'Thời gian phải là số nguyên' })
      .min(1, { error: 'Thời gian ít nhất 1 phút' })
      .max(EXAM_MAX_DURATION_MINUTES, { error: `Thời gian tối đa ${EXAM_MAX_DURATION_MINUTES} phút` })
      .describe('Time a student has for the exam, in minutes'),
    parts: z
      .strictObject({
        A: ExamPartBlueprintSchema.describe('Part A: multiple choice (MCQ)'),
        B: ExamPartBlueprintSchema.describe('Part B: essays (ESSAY)'),
      })
      .describe('Part A draws MCQ questions, part B ESSAY questions'),
  })
  .meta({ title: 'ExamBlueprint', description: 'Exam blueprint of a JD (BR-05)' });

export type ExamBlueprint = z.output<typeof ExamBlueprintSchema>;
