import type { ExamBlueprint, QuestionDifficulty, QuestionType } from '@srm/shared';
import { drawReviewSample, type ReviewCandidate } from '../review-sample.js';

// US-4.9 AC-1 (FR-19): the sample HR or CENTER review is stratified by blueprint cell and decided
// by the seed alone, so a reload shows the same questions.

const BLUEPRINT: ExamBlueprint = {
  duration_minutes: 45,
  parts: {
    A: {
      weight_percent: 60,
      question_count: 6,
      cells: [
        { skill: 'Java', difficulty: 'EASY', count: 2 },
        { skill: 'Java', difficulty: 'HARD', count: 1 },
        { skill: 'SQL', difficulty: 'EASY', count: 2 },
        { skill: 'SQL', difficulty: 'MEDIUM', count: 1 },
      ],
    },
    B: { weight_percent: 40, question_count: 2, cells: [{ skill: 'Java', difficulty: 'MEDIUM', count: 2 }] },
  },
};

let nextId = 1;
const question = (type: QuestionType, skill: string, difficulty: QuestionDifficulty): ReviewCandidate => ({
  id: nextId++,
  type,
  skill,
  difficulty,
});

/** `n` questions of each blueprint cell, plus one of a skill the blueprint does not have. */
function bank(n: number): ReviewCandidate[] {
  const cells: [QuestionType, string, QuestionDifficulty][] = [
    ['MCQ', 'Java', 'EASY'],
    ['MCQ', 'Java', 'HARD'],
    ['MCQ', 'SQL', 'EASY'],
    ['MCQ', 'SQL', 'MEDIUM'],
    ['ESSAY', 'Java', 'MEDIUM'],
  ];
  return [...cells.flatMap(([type, skill, difficulty]) => Array.from({ length: n }, () => question(type, skill, difficulty))), question('MCQ', 'Docker', 'EASY')];
}

const cellOf = (q: ReviewCandidate) => `${q.type}/${q.skill}/${q.difficulty}`;
const ids = (sample: { question: ReviewCandidate }[]) => sample.map((entry) => entry.question.id);

describe('GĐ5 review sample (US-4.9)', () => {
  it('GĐ5 AC-1 sample stratified by cell, same seed same sample', () => {
    const candidates = bank(4);
    const sample = drawReviewSample({ candidates, blueprint: BLUEPRINT, size: 10, seed: 7 });

    expect(sample).toHaveLength(10);
    // 5 cells, 10 questions: every cell gives two, none of the skill outside the blueprint.
    const perCell = new Map<string, number>();
    for (const { question: q } of sample) perCell.set(cellOf(q), (perCell.get(cellOf(q)) ?? 0) + 1);
    expect([...perCell.values()]).toEqual([2, 2, 2, 2, 2]);
    expect(sample.some(({ question: q }) => q.skill === 'Docker')).toBe(false);
    // Display order: part A then B, cells as the blueprint lists them.
    expect(sample.map((entry) => entry.part)).toEqual([...Array<string>(8).fill('A'), 'B', 'B']);
    expect(sample.slice(0, 2).every(({ question: q }) => cellOf(q) === 'MCQ/Java/EASY')).toBe(true);

    // The input order does not matter; another seed draws others.
    const again = drawReviewSample({ candidates: [...candidates].reverse(), blueprint: BLUEPRINT, size: 10, seed: 7 });
    expect(ids(again)).toEqual(ids(sample));
    const other = drawReviewSample({ candidates, blueprint: BLUEPRINT, size: 10, seed: 8 });
    expect(ids(other)).not.toEqual(ids(sample));
  });

  it('GĐ5 AC-1 a sample smaller than the blueprint takes one per cell, the essays first', () => {
    const sample = drawReviewSample({ candidates: bank(3), blueprint: BLUEPRINT, size: 3, seed: 1 });

    expect(sample).toHaveLength(3);
    expect(new Set(sample.map(({ question: q }) => cellOf(q))).size).toBe(3);
    expect(sample.at(-1)).toMatchObject({ part: 'B', question: { type: 'ESSAY' } });
  });

  it('GĐ5 AC-1 a cell short of questions leaves its turns to the others; never more than the bank holds', () => {
    const candidates = bank(1).filter((q) => cellOf(q) !== 'MCQ/SQL/MEDIUM');
    candidates.push(...Array.from({ length: 5 }, () => question('MCQ', 'Java', 'EASY')));

    const sample = drawReviewSample({ candidates, blueprint: BLUEPRINT, size: 8, seed: 3 });
    expect(sample.filter(({ question: q }) => cellOf(q) === 'MCQ/Java/EASY')).toHaveLength(5);
    expect(sample).toHaveLength(8);

    const all = drawReviewSample({ candidates, blueprint: BLUEPRINT, size: 50, seed: 3 });
    expect(all).toHaveLength(candidates.length - 1); // all but the Docker one
  });

  it('GĐ5 AC-4 a question dropped from the bank moves at most one question of the sample', () => {
    const candidates = bank(4);
    const sample = drawReviewSample({ candidates, blueprint: BLUEPRINT, size: 10, seed: 11 });
    const dropped = sample[3]!.question;

    const after = drawReviewSample({
      candidates: candidates.filter((q) => q.id !== dropped.id),
      blueprint: BLUEPRINT,
      size: 10,
      seed: 11,
    });
    const kept = ids(after).filter((id) => ids(sample).includes(id));
    expect(kept).toHaveLength(9);
    const added = after.find(({ question: q }) => !ids(sample).includes(q.id))!;
    expect(cellOf(added.question)).toBe(cellOf(dropped));
  });
});
