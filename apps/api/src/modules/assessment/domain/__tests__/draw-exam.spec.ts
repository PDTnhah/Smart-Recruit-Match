import { type BlueprintCell, type ExamBlueprint, MCQ_OPTION_COUNT, QUESTION_DIFFICULTIES, skillKey } from '@srm/shared';
import fc from 'fast-check';
import { cellKeyOf, cellsOf } from '../blueprint.js';
import { type DrawCandidate, drawExam, type DrawExamInput, type ExamDraw, mulberry32, OPTION_CODE_SPACE } from '../draw-exam.js';

// US-4.3 AC-1, AC-2 (BR-05, CONTEXT D51): every paper of a bank draws the same number of questions
// per cell and per part, for the same time; the seed alone decides which ones and in what order. The
// option codes come from a source of their own (the service uses crypto): here a seeded stand-in.

const SKILLS = ['Java core', 'SQL', 'React', 'Git', 'Docker', 'Python'] as const;

const part = (cells: BlueprintCell[], weight: number) => ({
  weight_percent: weight,
  question_count: cells.reduce((acc, cell) => acc + cell.count, 0),
  cells,
});

/** A valid blueprint: part A over 1–4 skills and their difficulties, part B 1–2 MEDIUM essays. */
const blueprintArb: fc.Arbitrary<ExamBlueprint> = fc
  .record({
    skills: fc.uniqueArray(fc.constantFrom(...SKILLS), { minLength: 1, maxLength: 4 }),
    counts: fc.array(fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 3, maxLength: 3 }), {
      minLength: 4,
      maxLength: 4,
    }),
    essays: fc.integer({ min: 1, max: 2 }),
    duration: fc.integer({ min: 10, max: 120 }),
  })
  .map(({ skills, counts, essays, duration }) => {
    const cellsA = skills.flatMap((skill, i) =>
      QUESTION_DIFFICULTIES.flatMap((difficulty, j): BlueprintCell[] => {
        const count = counts[i]?.[j] ?? 0;
        return count > 0 ? [{ skill, difficulty, count }] : [];
      }),
    );
    // Part A never empty: the first skill gets one EASY question when the counts left it bare.
    if (cellsA.length === 0) cellsA.push({ skill: skills[0] ?? 'SQL', difficulty: 'EASY', count: 1 });
    const cellsB = skills.slice(0, essays).map((skill): BlueprintCell => ({ skill, difficulty: 'MEDIUM', count: 1 }));
    return { duration_minutes: duration, parts: { A: part(cellsA, 60), B: part(cellsB, 40) } };
  });

/**
 * A bank for the blueprint: each cell holds 0–3 more questions than it draws, written with the
 * skill in another case, plus questions of cells the blueprint does not have.
 */
const scenarioArb = blueprintArb.chain((blueprint) =>
  fc
    .record({
      extras: fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 12, maxLength: 12 }),
      noise: fc.integer({ min: 0, max: 5 }),
      seed: fc.nat({ max: 0xffff_ffff }),
      order: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 80, maxLength: 80 }),
    })
    .map(({ extras, noise, seed, order }) => {
      let nextId = 100;
      const questions: DrawCandidate[] = [];
      cellsOf(blueprint).forEach((cell, i) => {
        for (let k = 0; k < cell.count + (extras[i] ?? 0); k += 1) {
          const skill = k % 2 === 0 ? cell.skill : cell.skill.toUpperCase();
          const optionCount = cell.type === 'MCQ' ? MCQ_OPTION_COUNT : 0;
          questions.push({ id: (nextId += 7), type: cell.type, skill, difficulty: cell.difficulty, optionCount });
        }
      });
      for (let k = 0; k < noise; k += 1) {
        questions.push({ id: (nextId += 7), type: 'MCQ', skill: 'Kotlin', difficulty: 'HARD', optionCount: 4 });
      }
      return { blueprint, questions, seed, order };
    }),
);

const permuted = <T>(items: readonly T[], keys: readonly number[]): T[] =>
  items
    .map((item, i) => ({ item, key: keys[i % keys.length] ?? 0, i }))
    .sort((a, b) => a.key - b.key || b.i - a.i)
    .map(({ item }) => item);

/** A reproducible stand-in for the service's cryptographic code source. */
function testCodes(salt: number): () => number {
  const random = mulberry32(salt ^ 0x9e37_79b9);
  return () => Math.floor(random() * OPTION_CODE_SPACE);
}

function drawOf(input: Omit<DrawExamInput, 'codes'> & { codes?: () => number }): ExamDraw {
  const result = drawExam({ codes: testCodes(input.seed), ...input });
  if (!result.ok) throw new Error(`unexpected short cells: ${JSON.stringify(result.shortCells)}`);
  return result.draw;
}

/** Questions drawn per cell key, the way the blueprint counts them. */
function countsByCell(draw: ExamDraw, questions: readonly DrawCandidate[]): Map<string, number> {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const counts = new Map<string, number>();
  for (const id of draw.questionIds) {
    const question = byId.get(id);
    if (!question) throw new Error(`drew unknown question ${id}`);
    const key = cellKeyOf(question.type, question.skill, question.difficulty);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function expectedCounts(blueprint: ExamBlueprint): Map<string, number> {
  const counts = new Map<string, number>();
  for (const cell of cellsOf(blueprint)) {
    const key = cellKeyOf(cell.type, cell.skill, cell.difficulty);
    counts.set(key, (counts.get(key) ?? 0) + cell.count);
  }
  return counts;
}

describe('GĐ5: exam draw (BR-05, US-4.3 AC-1, AC-2)', () => {
  it('BR-05 property: same cell counts and duration', () => {
    fc.assert(
      fc.property(scenarioArb, fc.nat({ max: 0xffff_ffff }), ({ blueprint, questions, seed }, otherSeed) => {
        const papers = [drawOf({ questions, blueprint, seed }), drawOf({ questions, blueprint, seed: otherSeed })];
        const partB = blueprint.parts.B.cells.reduce((acc, cell) => acc + cell.count, 0);
        const byId = new Map(questions.map((question) => [question.id, question]));
        for (const paper of papers) {
          expect(countsByCell(paper, questions)).toEqual(expectedCounts(blueprint));
          expect(new Set(paper.questionIds).size).toBe(paper.questionIds.length);
          expect(paper.durationMinutes).toBe(blueprint.duration_minutes);
          // Part A first, then the essays of part B.
          const types = paper.questionIds.map((id) => byId.get(id)?.type);
          const firstEssay = types.indexOf('ESSAY');
          expect(types.filter((type) => type === 'ESSAY')).toHaveLength(partB);
          expect(types.slice(firstEssay).every((type) => type === 'ESSAY')).toBe(true);
        }
      }),
    );
  });

  it('BR-05 same seed reproduces draw, whatever the input order', () => {
    fc.assert(
      fc.property(scenarioArb, ({ blueprint, questions, seed, order }) => {
        const first = drawOf({ questions, blueprint, seed });
        expect(drawOf({ questions: permuted(questions, order), blueprint, seed })).toEqual(first);
      }),
    );
  });

  it('GĐ5 property: every MCQ has its options shuffled under distinct opaque codes; essays none', () => {
    fc.assert(
      fc.property(scenarioArb, ({ blueprint, questions, seed }) => {
        const paper = drawOf({ questions, blueprint, seed });
        const byId = new Map(questions.map((question) => [question.id, question]));
        const mcqIds = paper.questionIds.filter((id) => byId.get(id)?.type === 'MCQ').map(String);
        expect(Object.keys(paper.optionLayout).sort()).toEqual(mcqIds.sort());
        for (const slots of Object.values(paper.optionLayout)) {
          expect(slots.map((slot) => slot.index).sort()).toEqual([0, 1, 2, 3]);
          expect(new Set(slots.map((slot) => slot.code)).size).toBe(MCQ_OPTION_COUNT);
          for (const slot of slots) expect(slot.code).toMatch(/^[0-9a-z]{6}$/);
        }
      }),
    );
  });

  it('GĐ5 AC-3 the option codes come from their own source, not from the seed', () => {
    fc.assert(
      fc.property(scenarioArb, fc.nat(), fc.nat(), ({ blueprint, questions, seed }, saltA, saltB) => {
        fc.pre(saltA !== saltB);
        const a = drawOf({ questions, blueprint, seed, codes: testCodes(saltA) });
        const b = drawOf({ questions, blueprint, seed, codes: testCodes(saltB) });
        // Same paper, same option order; only the codes differ.
        expect(b.questionIds).toEqual(a.questionIds);
        for (const [id, slots] of Object.entries(a.optionLayout)) {
          expect(b.optionLayout[id]?.map((slot) => slot.index)).toEqual(slots.map((slot) => slot.index));
          expect(b.optionLayout[id]?.map((slot) => slot.code)).not.toEqual(slots.map((slot) => slot.code));
        }
      }),
    );
  });

  it('GĐ5 two seeds give different papers of the same bank, under other option codes', () => {
    const blueprint: ExamBlueprint = {
      duration_minutes: 45,
      parts: {
        A: part([{ skill: 'SQL', difficulty: 'EASY', count: 4 }], 60),
        B: part([{ skill: 'SQL', difficulty: 'MEDIUM', count: 1 }], 40),
      },
    };
    const questions: DrawCandidate[] = [
      ...[1, 2, 3, 4].map((id): DrawCandidate => ({ id, type: 'MCQ', skill: 'SQL', difficulty: 'EASY', optionCount: 4 })),
      { id: 50, type: 'ESSAY', skill: 'SQL', difficulty: 'MEDIUM', optionCount: 0 },
    ];
    const a = drawOf({ questions, blueprint, seed: 1 });
    const b = drawOf({ questions, blueprint, seed: 2 });
    // The bank holds just enough: both papers have the same questions, essay last.
    expect([...a.questionIds].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 50]);
    expect(a.questionIds.at(-1)).toBe(50);
    expect([...b.questionIds].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 50]);
    // Codes belong to one session: the same question gets other codes in another one.
    for (const id of ['1', '2', '3', '4']) {
      expect(a.optionLayout[id]?.map((slot) => slot.code)).not.toEqual(b.optionLayout[id]?.map((slot) => slot.code));
    }
  });

  it('GĐ5 a cell short of questions fails the whole draw with what it lacks', () => {
    const blueprint: ExamBlueprint = {
      duration_minutes: 30,
      parts: {
        A: part(
          [
            { skill: 'SQL', difficulty: 'EASY', count: 2 },
            { skill: 'Git', difficulty: 'HARD', count: 2 },
          ],
          60,
        ),
        B: part([{ skill: 'SQL', difficulty: 'MEDIUM', count: 1 }], 40),
      },
    };
    const questions: DrawCandidate[] = [
      { id: 1, type: 'MCQ', skill: 'sql', difficulty: 'EASY', optionCount: 4 },
      { id: 2, type: 'MCQ', skill: 'SQL', difficulty: 'EASY', optionCount: 4 },
      { id: 3, type: 'MCQ', skill: 'Git', difficulty: 'HARD', optionCount: 4 },
      // Same skill and difficulty, wrong type: not a question of the part A cell.
      { id: 4, type: 'ESSAY', skill: 'Git', difficulty: 'HARD', optionCount: 0 },
      { id: 5, type: 'ESSAY', skill: 'SQL', difficulty: 'MEDIUM', optionCount: 0 },
    ];
    expect(drawExam({ questions, blueprint, seed: 7, codes: testCodes(7) })).toEqual({
      ok: false,
      shortCells: [{ part: 'A', type: 'MCQ', skill: 'Git', difficulty: 'HARD', needed: 2, available: 1 }],
    });
  });

  it('GĐ5 a question listed twice is drawn at most once', () => {
    const blueprint: ExamBlueprint = {
      duration_minutes: 30,
      parts: {
        A: part([{ skill: 'SQL', difficulty: 'EASY', count: 2 }], 60),
        B: part([{ skill: 'SQL', difficulty: 'MEDIUM', count: 1 }], 40),
      },
    };
    const mcq: DrawCandidate = { id: 1, type: 'MCQ', skill: 'SQL', difficulty: 'EASY', optionCount: 4 };
    const essay: DrawCandidate = { id: 9, type: 'ESSAY', skill: 'SQL', difficulty: 'MEDIUM', optionCount: 0 };
    expect(drawExam({ questions: [mcq, mcq, essay], blueprint, seed: 3, codes: testCodes(3) })).toMatchObject({ ok: false });
  });

  it('GĐ5 the draw refuses a seed outside 32 bits', () => {
    const blueprint: ExamBlueprint = {
      duration_minutes: 30,
      parts: { A: part([{ skill: 'SQL', difficulty: 'EASY', count: 1 }], 60), B: part([], 40) },
    };
    expect(() => drawExam({ questions: [], blueprint, seed: -1, codes: testCodes(0) })).toThrow('32-bit');
    expect(() => drawExam({ questions: [], blueprint, seed: 2 ** 32, codes: testCodes(0) })).toThrow('32-bit');
    expect(() => drawExam({ questions: [], blueprint, seed: 1.5, codes: testCodes(0) })).toThrow('32-bit');
  });

  it('GĐ5 mulberry32 is deterministic and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const values = Array.from({ length: 1000 }, () => a());
    expect(values).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(skillKey('SQL')).toBe(skillKey('sql'));
  });
});
