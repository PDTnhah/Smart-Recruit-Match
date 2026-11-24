import { ManualQuestionInputSchema } from '../manual-question.js';

// US-4.13 AC-2 (FR-42): a question added by hand passes the rules of the Test Generator's drafts.
// The cross-field rule of the schema: four different options, compared as the AI Service compares
// them (whitespace collapsed, case kept).

const issues = (body: unknown) =>
  ManualQuestionInputSchema.safeParse(body).error?.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) ?? [];

const mcq = (options: string[], extra: Record<string, unknown> = {}) => ({
  type: 'MCQ',
  skill: 'Java',
  difficulty: 'EASY',
  stem: 'Kiểu nào là kiểu nguyên thủy?',
  options,
  correctOption: 0,
  explanation: 'int là kiểu nguyên thủy.',
  ...extra,
});

describe('FR-42 manual question input', () => {
  it('FR-42 AC-2 four different options pass; case counts, as in submit_questions()', () => {
    expect(issues(mcq(['int', 'Integer', 'String', 'Object']))).toEqual([]);
    expect(issues(mcq(['boolean', 'Boolean', 'String', 'Object']))).toEqual([]);
  });

  it('FR-42 AC-2 an option repeating an earlier one, spacing aside, is an error at that option', () => {
    expect(issues(mcq(['int', 'String', ' int ', 'Object  x']))).toEqual(['options.2: Trùng với phương án A']);
    expect(issues(mcq(['a b', 'c', 'a  b', 'c']))).toEqual(['options.2: Trùng với phương án A', 'options.3: Trùng với phương án B']);
  });

  it('FR-42 AC-2 the duplicate check still runs when another field is invalid (LESSONS §10)', () => {
    expect(issues(mcq(['int', 'int', 'x', 'y'], { stem: '', correctOption: 4 }))).toEqual([
      'stem: Nhập đề',
      'correctOption: Chọn đáp án đúng',
      'options.1: Trùng với phương án A',
    ]);
  });
});
