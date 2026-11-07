import { ExamBlueprintSchema } from '../../contracts/exam-blueprint.js';
import { GeneratedQuestionSchema } from '../../contracts/questions.js';
import { examBlueprintRequestSchema } from '../exam-blueprint.js';

interface Issue {
  path: PropertyKey[];
  message: string;
}

function issuePaths(result: { success: boolean; error?: { issues: Issue[] } }): string[] {
  return result.error?.issues.map((issue) => issue.path.join('.')) ?? [];
}

const requirements = {
  must_have: [
    { skill: 'Java', level: 'INTERMEDIATE' as const, weight: 6 },
    { skill: 'Spring Boot', level: 'BASIC' as const, weight: 5 },
  ],
  nice_to_have: [{ skill: 'Docker', level: 'BASIC' as const, weight: 2 }],
};

const schema = examBlueprintRequestSchema(requirements);

function blueprint() {
  return {
    duration_minutes: 45,
    parts: {
      A: {
        weight_percent: 60,
        question_count: 10,
        cells: [
          { skill: 'Java', difficulty: 'EASY', count: 4 },
          { skill: 'Java', difficulty: 'HARD', count: 2 },
          { skill: 'Spring Boot', difficulty: 'MEDIUM', count: 3 },
          { skill: 'Docker', difficulty: 'EASY', count: 1 },
        ],
      },
      B: {
        weight_percent: 40,
        question_count: 2,
        cells: [
          { skill: 'Java', difficulty: 'MEDIUM', count: 1 },
          { skill: 'Spring Boot', difficulty: 'MEDIUM', count: 1 },
        ],
      },
    },
  };
}

describe('BR-05: exam blueprint request (US-4.1 AC-2)', () => {
  it('BR-05 accepts a blueprint whose cells add up and name skills of the JD', () => {
    expect(schema.parse(blueprint())).toEqual(blueprint());
  });

  it('BR-05 matches skills by skillKey, so "java" and " Spring boot " are the JD skills', () => {
    const value = blueprint();
    value.parts.A.cells[0]!.skill = 'java';
    value.parts.B.cells[1]!.skill = ' Spring boot ';
    expect(schema.safeParse(value).success).toBe(true);
  });

  it('BR-05 blueprint rejects cell sum mismatch', () => {
    const value = blueprint();
    value.parts.A.question_count = 11;
    expect(issuePaths(schema.safeParse(value))).toEqual(['parts.A.question_count']);
  });

  it('BR-05 blueprint rejects weights ≠ 100', () => {
    const value = blueprint();
    value.parts.A.weight_percent = 70;
    expect(issuePaths(schema.safeParse(value))).toEqual(['parts.B.weight_percent']);
  });

  it('BR-05 blueprint rejects unknown skill', () => {
    const value = blueprint();
    value.parts.A.cells[3]!.skill = 'Kotlin';
    const result = schema.safeParse(value);
    expect(issuePaths(result)).toEqual(['parts.A.cells.3.skill']);
    expect(result.error?.issues[0]?.message).toBe('Kỹ năng "Kotlin" không có trong yêu cầu của JD');
  });

  it('BR-05 blueprint rejects part C (Q7)', () => {
    const value = { ...blueprint(), parts: { ...blueprint().parts, C: blueprint().parts.B } };
    expect(schema.safeParse(value).success).toBe(false);
    expect(ExamBlueprintSchema.safeParse(value).success).toBe(false);
  });

  it('BR-05 blueprint rejects a repeated cell within a part', () => {
    const value = blueprint();
    value.parts.A.cells[3] = { skill: 'JAVA', difficulty: 'EASY', count: 1 };
    expect(issuePaths(schema.safeParse(value))).toEqual(['parts.A.cells.3.skill']);
  });

  it('BR-05 the same skill and difficulty may appear once in each part', () => {
    const value = blueprint();
    value.parts.A.cells[2] = { skill: 'Java', difficulty: 'MEDIUM', count: 3 };
    expect(schema.safeParse(value).success).toBe(true);
  });

  it.each([1, 4])('BR-05 part B with %p essays is rejected (2–3)', (essays) => {
    const value = blueprint();
    value.parts.B.question_count = essays;
    value.parts.B.cells = [{ skill: 'Java', difficulty: 'MEDIUM', count: essays }];
    expect(issuePaths(schema.safeParse(value))).toEqual(['parts.B.question_count']);
  });

  it('BR-05 the cross-field errors still show next to an invalid field (LESSONS §10)', () => {
    const value = blueprint();
    value.duration_minutes = 0;
    value.parts.A.weight_percent = 70;
    value.parts.A.cells[3]!.skill = 'Kotlin';
    expect(issuePaths(schema.safeParse(value)).sort()).toEqual([
      'duration_minutes',
      'parts.A.cells.3.skill',
      'parts.B.weight_percent',
    ]);
  });

  it('BR-05 an invalid cell count hides the cross-field errors until fixed (Zod 4, LESSONS §10)', () => {
    const value = blueprint();
    value.parts.A.cells[0]!.count = 1.5;
    value.parts.A.weight_percent = 70;
    expect(issuePaths(schema.safeParse(value))).toEqual(['parts.A.cells.0.count']);
  });

  it('BR-05 a missing blueprint fails without throwing (LESSONS §10)', () => {
    expect(schema.safeParse(undefined).success).toBe(false);
    expect(schema.safeParse({ duration_minutes: 45 }).success).toBe(false);
  });
});

describe('AD-6: draft question contract (US-4.1 AC-9)', () => {
  const base = {
    draft_id: 1,
    skill: 'Java',
    difficulty: 'EASY',
    stem: 'Từ khóa nào khai báo hằng trong Java?',
    explanation: '`final` khiến biến chỉ gán được một lần.',
    model: 'fixture',
    prompt_version: 'test_generator/v1',
    validation: null,
  };
  const options = ['final', 'const', 'static', 'let'].map((text, index) => ({ text, correct: index === 0 }));

  it('AD-6 an MCQ draft has exactly 4 options', () => {
    expect(GeneratedQuestionSchema.safeParse({ ...base, type: 'MCQ', options }).success).toBe(true);
    expect(GeneratedQuestionSchema.safeParse({ ...base, type: 'MCQ', options: options.slice(0, 3) }).success).toBe(false);
  });

  it('AD-6 an essay draft carries a rubric and a sample answer, and no options', () => {
    const essay = { ...base, type: 'ESSAY', rubric: [{ criterion: 'Nêu đúng ý chính', max_points: 5 }], sample_answer: 'Mẫu' };
    expect(GeneratedQuestionSchema.safeParse(essay).success).toBe(true);
    expect(GeneratedQuestionSchema.safeParse({ ...essay, rubric: [] }).success).toBe(false);
    expect(GeneratedQuestionSchema.safeParse({ ...essay, options }).success).toBe(false);
  });

  it('GĐ5 a draft carries the verdict of the Validator, reasons from the fixed list (US-4.2 AC-5)', () => {
    const validation = {
      status: 'REJECTED',
      reasons: ['ANSWER_MISMATCH', 'DIFFICULTY_MISMATCH'],
      correct_options: [2],
      estimated_difficulty: 'HARD',
      note: null,
      model: 'fixture',
      prompt_version: 'validator/v1',
    };
    expect(GeneratedQuestionSchema.safeParse({ ...base, type: 'MCQ', options, validation }).success).toBe(true);
    const unknownReason = { ...validation, reasons: ['TOO_LONG'] };
    expect(GeneratedQuestionSchema.safeParse({ ...base, type: 'MCQ', options, validation: unknownReason }).success).toBe(
      false,
    );
    const outOfRange = { ...validation, correct_options: [4] };
    expect(GeneratedQuestionSchema.safeParse({ ...base, type: 'MCQ', options, validation: outOfRange }).success).toBe(false);
    const withoutKey: Record<string, unknown> = { ...base, type: 'MCQ', options };
    delete withoutKey.validation;
    expect(GeneratedQuestionSchema.safeParse(withoutKey).success).toBe(false);
  });
});
