import type { ExamBlueprint, JdSkillRequirement, QuestionDifficulty } from '@srm/shared';
import { examBlueprintRequestSchema, skillKey } from '@srm/shared';
import fc from 'fast-check';
import { blueprintCellFilter, buildDefaultBlueprint, controlledRound, coverageOf, largestRemainder } from '../blueprint.js';

const skill = (name: string, weight: number): JdSkillRequirement => ({ skill: name, level: 'BASIC', weight });

/** Part A as `skill → [EASY, MEDIUM, HARD]`. */
function gridOf(blueprint: ExamBlueprint): Record<string, number[]> {
  const grid: Record<string, number[]> = {};
  const column: Record<QuestionDifficulty, number> = { EASY: 0, MEDIUM: 1, HARD: 2 };
  for (const cell of blueprint.parts.A.cells) {
    const line = (grid[cell.skill] ??= [0, 0, 0]);
    line[column[cell.difficulty]] = cell.count;
  }
  return grid;
}

const total = (values: readonly number[]) => values.reduce((acc, value) => acc + value, 0);

describe('GĐ5: default exam blueprint (BR-05, US-4.1 AC-1)', () => {
  // PRD › GĐ5 › Ví dụ ma trận đề phần A: weights 30/30/25/15 %.
  const backendJava = [
    skill('Java core, OOP', 6),
    skill('Spring Boot, REST API', 6),
    skill('SQL, cơ sở dữ liệu', 5),
    skill('Git, kiến thức chung', 3),
  ];

  it('GĐ5 PRD example Backend Java blueprint', () => {
    const blueprint = buildDefaultBlueprint({ must_have: backendJava }, { durationMinutes: 45 });
    expect(gridOf(blueprint)).toEqual({
      'Java core, OOP': [2, 3, 1],
      'Spring Boot, REST API': [2, 3, 1],
      'SQL, cơ sở dữ liệu': [2, 2, 1],
      'Git, kiến thức chung': [2, 1, 0],
    });
    expect(blueprint.parts.A).toMatchObject({ weight_percent: 60, question_count: 20 });
    expect(blueprint.parts.B).toEqual({
      weight_percent: 40,
      question_count: 2,
      cells: [
        { skill: 'Java core, OOP', difficulty: 'MEDIUM', count: 1 },
        { skill: 'Spring Boot, REST API', difficulty: 'MEDIUM', count: 1 },
      ],
    });
    expect(blueprint.duration_minutes).toBe(45);
    // The default is a valid blueprint for its own JD (AC-2).
    expect(examBlueprintRequestSchema({ must_have: backendJava, nice_to_have: [] }).safeParse(blueprint).success).toBe(
      true,
    );
  });

  it('GĐ5 the cells follow the order of must_have and leave out empty ones', () => {
    const blueprint = buildDefaultBlueprint({ must_have: backendJava }, { durationMinutes: 45 });
    expect(blueprint.parts.A.cells.map((cell) => `${cell.skill}/${cell.difficulty}`)).toEqual([
      'Java core, OOP/EASY',
      'Java core, OOP/MEDIUM',
      'Java core, OOP/HARD',
      'Spring Boot, REST API/EASY',
      'Spring Boot, REST API/MEDIUM',
      'Spring Boot, REST API/HARD',
      'SQL, cơ sở dữ liệu/EASY',
      'SQL, cơ sở dữ liệu/MEDIUM',
      'SQL, cơ sở dữ liệu/HARD',
      'Git, kiến thức chung/EASY',
      'Git, kiến thức chung/MEDIUM',
    ]);
  });

  it('GĐ5 a JD with one must-have skill puts both essays on it', () => {
    const blueprint = buildDefaultBlueprint({ must_have: [skill('Python', 4)] }, { durationMinutes: 30 });
    expect(gridOf(blueprint)).toEqual({ Python: [8, 9, 3] });
    expect(blueprint.parts.B.cells).toEqual([{ skill: 'Python', difficulty: 'MEDIUM', count: 2 }]);
  });

  it('GĐ5 more must-have skills than questions: the lightest get no cell', () => {
    const many = Array.from({ length: 25 }, (_, index) => skill(`Skill ${String(index).padStart(2, '0')}`, 25 - index));
    const blueprint = buildDefaultBlueprint({ must_have: many }, { durationMinutes: 45 });
    const grid = gridOf(blueprint);
    expect(Object.keys(grid).length).toBeLessThan(25);
    expect(total(Object.values(grid).map(total))).toBe(20);
    expect(grid['Skill 24']).toBeUndefined();
  });

  it('GĐ5 rows 4/4/6/6 keep each cell within one of its quota (augmenting path)', () => {
    const grid = controlledRound([4, 4, 6, 6], [8, 9, 3], [40, 45, 15]);
    expect(grid.map(total)).toEqual([4, 4, 6, 6]);
    expect([0, 1, 2].map((j) => total(grid.map((line) => line[j] ?? 0)))).toEqual([8, 9, 3]);
    [4, 4, 6, 6].forEach((row, i) =>
      [40, 45, 15].forEach((percent, j) => {
        expect(Math.abs((grid[i]?.[j] ?? 0) - (row * percent) / 100)).toBeLessThan(1);
      }),
    );
  });

  it('GĐ5 largest remainder gives ties to the lower index', () => {
    expect(largestRemainder(20, [40, 45, 15])).toEqual([8, 9, 3]);
    expect(largestRemainder(2, [1, 1, 1])).toEqual([1, 1, 0]);
    expect(largestRemainder(10, [1, 2])).toEqual([3, 7]);
  });

  const NAMES = ['Java', 'SQL', 'Docker', 'Redis', 'React', 'Python', 'Git', 'Linux', 'AWS', 'Kafka', 'Go', 'Rust'];

  /** 1–30 distinct must-have skills with weights in (0, 10], two decimals, as HR enters them. */
  const mustHave = fc
    .uniqueArray(
      fc.oneof(
        fc.constantFrom(...NAMES),
        fc.integer({ min: 0, max: 99 }).map((n) => `Skill ${n}`),
      ),
      { minLength: 1, maxLength: 30, selector: skillKey },
    )
    .chain((names) =>
      fc
        .array(fc.integer({ min: 1, max: 1000 }), { minLength: names.length, maxLength: names.length })
        .map((weights) => names.map((name, index) => skill(name, (weights[index] ?? 1) / 100))),
    );

  it('BR-05 default blueprint sums and determinism (property)', () => {
    fc.assert(
      fc.property(mustHave, fc.integer({ min: 0, max: 1000 }), (items, seed) => {
        const blueprint = buildDefaultBlueprint({ must_have: items }, { durationMinutes: 45 });
        const { A, B } = blueprint.parts;
        // Totals: 20 MCQ split 8/9/3 by difficulty; 2 essays.
        expect(total(A.cells.map((cell) => cell.count))).toBe(20);
        const byDifficulty = (difficulty: QuestionDifficulty) =>
          total(A.cells.filter((cell) => cell.difficulty === difficulty).map((cell) => cell.count));
        expect([byDifficulty('EASY'), byDifficulty('MEDIUM'), byDifficulty('HARD')]).toEqual([8, 9, 3]);
        expect(total(B.cells.map((cell) => cell.count))).toBe(2);
        expect(B.cells.every((cell) => cell.difficulty === 'MEDIUM')).toBe(true);
        expect([...A.cells, ...B.cells].every((cell) => cell.count >= 1)).toBe(true);
        // Each cell is within one of its quota row × percent.
        const rows = new Map(Object.entries(gridOf(blueprint)).map(([name, line]) => [name, total(line)]));
        for (const cell of A.cells) {
          const percent = { EASY: 40, MEDIUM: 45, HARD: 15 }[cell.difficulty];
          expect(Math.abs(cell.count - ((rows.get(cell.skill) ?? 0) * percent) / 100)).toBeLessThan(1);
        }
        // Valid for the JD, and the same cells whatever the order of must_have.
        expect(examBlueprintRequestSchema({ must_have: items, nice_to_have: [] }).safeParse(blueprint).success).toBe(true);
        const cut = seed % items.length;
        const shuffled = [...items.slice(cut), ...items.slice(0, cut)].reverse();
        const again = buildDefaultBlueprint({ must_have: shuffled }, { durationMinutes: 45 });
        const sorted = (value: ExamBlueprint) =>
          [...value.parts.A.cells, ...value.parts.B.cells.map((cell) => ({ ...cell, skill: `B:${cell.skill}` }))]
            .map((cell) => `${cell.skill}/${cell.difficulty}/${cell.count}`)
            .sort();
        expect(sorted(again)).toEqual(sorted(blueprint));
      }),
      { numRuns: 300 },
    );
  });
});

describe('BR-05: coverage of a question bank (US-4.1 AC-3)', () => {
  const blueprint: ExamBlueprint = {
    duration_minutes: 45,
    parts: {
      A: {
        weight_percent: 60,
        question_count: 3,
        cells: [
          { skill: 'Java', difficulty: 'EASY', count: 2 },
          { skill: 'SQL', difficulty: 'HARD', count: 1 },
        ],
      },
      B: { weight_percent: 40, question_count: 2, cells: [{ skill: 'Java', difficulty: 'MEDIUM', count: 2 }] },
    },
  };

  const empty = { validated: 0, rejected: 0, pending: 0, rejectReasons: {} };

  it('BR-05 counts drafts per cell by skillKey against 3× and 5× of the cell', () => {
    const coverage = coverageOf(blueprint, [
      { type: 'MCQ', skill: 'Java', difficulty: 'EASY', status: 'DRAFT', count: 4 },
      { type: 'MCQ', skill: 'java', difficulty: 'EASY', status: 'DRAFT', count: 2 },
      // An essay of the same skill and difficulty belongs to part B only.
      { type: 'ESSAY', skill: 'Java', difficulty: 'EASY', status: 'DRAFT', count: 9 },
      { type: 'ESSAY', skill: 'Java', difficulty: 'MEDIUM', status: 'DRAFT', count: 5 },
      // A cell the blueprint no longer has.
      { type: 'MCQ', skill: 'Docker', difficulty: 'EASY', status: 'DRAFT', count: 3 },
    ]);
    expect(coverage).toEqual([
      { part: 'A', type: 'MCQ', skill: 'Java', difficulty: 'EASY', needed: 2, ...empty, drafted: 6, pending: 6, min: 6, max: 10 },
      { part: 'A', type: 'MCQ', skill: 'SQL', difficulty: 'HARD', needed: 1, ...empty, drafted: 0, min: 3, max: 5 },
      { part: 'B', type: 'ESSAY', skill: 'Java', difficulty: 'MEDIUM', needed: 2, ...empty, drafted: 5, pending: 5, min: 6, max: 10 },
    ]);
  });

  it('GĐ5 splits each cell by status and counts rejected questions per reason (US-4.2 AC-4, AC-10)', () => {
    const [java] = coverageOf(
      blueprint,
      [
        { type: 'MCQ', skill: 'Java', difficulty: 'EASY', status: 'VALIDATED', count: 5 },
        { type: 'MCQ', skill: 'java', difficulty: 'EASY', status: 'VALIDATED', count: 1 },
        { type: 'MCQ', skill: 'Java', difficulty: 'EASY', status: 'REJECTED', count: 3 },
        { type: 'MCQ', skill: 'Java', difficulty: 'EASY', status: 'DRAFT', count: 2 },
        { type: 'MCQ', skill: 'Java', difficulty: 'EASY', status: 'RETIRED', count: 1 },
      ],
      [
        { type: 'MCQ', skill: 'Java', difficulty: 'EASY', reason: 'ANSWER_MISMATCH', count: 2 },
        { type: 'MCQ', skill: 'Java', difficulty: 'EASY', reason: 'DIFFICULTY_MISMATCH', count: 1 },
        { type: 'MCQ', skill: 'java', difficulty: 'EASY', reason: 'ANSWER_MISMATCH', count: 1 },
        // A reason of a cell the blueprint does not have.
        { type: 'MCQ', skill: 'Docker', difficulty: 'EASY', reason: 'UNCLEAR', count: 4 },
      ],
    );
    expect(java).toMatchObject({
      drafted: 12,
      validated: 6,
      rejected: 3,
      pending: 2,
      rejectReasons: { ANSWER_MISMATCH: 3, DIFFICULTY_MISMATCH: 1 },
    });
  });

  it('GĐ5 an exam draws only questions of the blueprint cells, by skillKey (US-4.2 AC-8, AC-11)', () => {
    const inBlueprint = blueprintCellFilter(blueprint);
    expect(inBlueprint({ type: 'MCQ', skill: 'java', difficulty: 'EASY' })).toBe(true);
    expect(inBlueprint({ type: 'ESSAY', skill: 'Java', difficulty: 'MEDIUM' })).toBe(true);
    // Same skill and difficulty, other part; a skill the JD dropped; a difficulty without a cell.
    expect(inBlueprint({ type: 'ESSAY', skill: 'Java', difficulty: 'EASY' })).toBe(false);
    expect(inBlueprint({ type: 'MCQ', skill: 'Docker', difficulty: 'EASY' })).toBe(false);
    expect(inBlueprint({ type: 'MCQ', skill: 'SQL', difficulty: 'EASY' })).toBe(false);
  });
});
