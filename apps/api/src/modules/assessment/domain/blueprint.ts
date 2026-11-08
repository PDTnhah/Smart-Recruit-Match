import {
  type BlueprintCell,
  type CellCoverage,
  EXAM_BLUEPRINT_DEFAULTS,
  EXAM_PART_TYPES,
  EXAM_PARTS,
  type ExamBlueprint,
  type ExamPart,
  type JdRequirements,
  QUESTION_BANK_FACTORS,
  QUESTION_DIFFICULTIES,
  type QuestionDifficulty,
  type QuestionRejectReason,
  type QuestionStatus,
  type QuestionType,
  skillKey,
} from '@srm/shared';

// Exam blueprint of a JD (BR-05, PRD GĐ5, US-4.1 AC-1, CONTEXT D49). Pure: no NestJS, no Drizzle.

/** Weights are scaled to integers before they are divided, so every remainder is exact. */
const WEIGHT_SCALE = 1_000;

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Splits `total` in proportion to integer `weights` by largest remainder: each share gets the
 * floor of its quota, then the shares with the largest remainders get one more. Ties go to the
 * lower index, so callers order the shares by their tie-break first.
 */
export function largestRemainder(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (sum <= 0) throw new Error('largestRemainder needs a positive total weight');
  const shares = weights.map((weight) => Math.floor((total * weight) / sum));
  let left = total - shares.reduce((acc, share) => acc + share, 0);
  const order = weights
    .map((weight, index) => ({ index, remainder: (total * weight) % sum }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) {
    if (left === 0) break;
    shares[index] = (shares[index] ?? 0) + 1;
    left -= 1;
  }
  return shares;
}

/**
 * Controlled rounding of the grid `rows[i] × percents[j] / 100` (CONTEXT D49): every row adds up to
 * `rows[i]`, every column to `columns[j]`, and each cell is the floor of its quota or, when the
 * quota has a remainder, one more.
 * 1. Each cell starts from the floor; cells get one more by descending remainder, only while both
 *    their row and their column are still short. Ties go to the lower row, then the lower column.
 * 2. That pass can leave a row and a column short with no cell between them left to raise (rows
 *    4/4/6/6 of 20 questions do). Each such question is placed along an
 *    augmenting path found breadth first in fixed order: raise a cell of the short row, lower a
 *    raised cell in that column, raise one in the next row, … until a short column is reached.
 *    Every row and column keeps its total along the path.
 */
export function controlledRound(
  rows: readonly number[],
  columns: readonly number[],
  percents: readonly number[],
): number[][] {
  const scale = sum(percents);
  const floors = rows.map((row) => percents.map((percent) => Math.floor((row * percent) / scale)));
  const remainders = rows.map((row) => percents.map((percent) => (row * percent) % scale));
  const raised = rows.map(() => percents.map(() => false));
  const rowLeft = rows.map((row, i) => row - sum(floors[i] ?? []));
  const columnLeft = columns.map((column, j) => column - sum(floors.map((line) => line[j] ?? 0)));
  if (sum(rowLeft) !== sum(columnLeft)) throw new Error('controlledRound needs rows and columns of the same total');

  const canRaise = (i: number, j: number): boolean => (remainders[i]?.[j] ?? 0) > 0 && raised[i]?.[j] === false;
  const setRaised = (i: number, j: number, value: boolean): void => {
    const line = raised[i];
    if (line) line[j] = value;
  };
  const place = (i: number, j: number): void => {
    rowLeft[i] = (rowLeft[i] ?? 0) - 1;
    columnLeft[j] = (columnLeft[j] ?? 0) - 1;
  };

  const byRemainder = rows
    .flatMap((_, i) => percents.map((__, j) => ({ i, j, remainder: remainders[i]?.[j] ?? 0 })))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i || a.j - b.j);
  for (const { i, j } of byRemainder) {
    if (!canRaise(i, j) || (rowLeft[i] ?? 0) <= 0 || (columnLeft[j] ?? 0) <= 0) continue;
    setRaised(i, j, true);
    place(i, j);
  }

  /** Raises along one augmenting path from row `start`; returns the short column it reached. */
  const augment = (start: number): number | null => {
    const fromRow = percents.map(() => -1);
    const fromColumn = rows.map(() => -1);
    const reached = rows.map((_, i) => i === start);
    const queue = [start];
    let end = -1;
    for (let head = 0; head < queue.length && end < 0; head += 1) {
      const i = queue[head] ?? start;
      for (let j = 0; j < percents.length && end < 0; j += 1) {
        if ((fromRow[j] ?? 0) >= 0 || !canRaise(i, j)) continue;
        fromRow[j] = i;
        if ((columnLeft[j] ?? 0) > 0) end = j;
        else {
          rows.forEach((_, next) => {
            if (reached[next] || raised[next]?.[j] !== true) return;
            reached[next] = true;
            fromColumn[next] = j;
            queue.push(next);
          });
        }
      }
    }
    if (end < 0) return null;
    for (let j = end; ; ) {
      const i = fromRow[j] ?? start;
      setRaised(i, j, true);
      if (i === start) break;
      const back = fromColumn[i] ?? end;
      setRaised(i, back, false);
      j = back;
    }
    return end;
  };

  for (let start = rowLeft.findIndex((left) => left > 0); start >= 0; start = rowLeft.findIndex((left) => left > 0)) {
    const end = augment(start);
    if (end === null) throw new Error('controlledRound found no rounding within one of each quota');
    place(start, end);
  }
  return floors.map((line, i) => line.map((value, j) => value + (raised[i]?.[j] ? 1 : 0)));
}

function sum(values: readonly number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

interface RankedSkill {
  /** As the requirements write it, trimmed. */
  skill: string;
  key: string;
  weight: number;
  /** Position in `must_have`: the order the cells are listed in. */
  position: number;
}

/**
 * AC-1: the default blueprint of a JD (PRD GĐ5, CONTEXT D49).
 * - Part A: 20 MCQ over the must-have skills by weight, then by difficulty 40/45/15, rounded on
 *   both axes; a skill left with no question has no cell.
 * - Part B: 2 MEDIUM essays on the 2 heaviest must-have skills (one skill takes both when the JD
 *   has only one).
 * - Weights 60/40; the duration is the campaign's T_test.
 * Ties go to the lower `skillKey`, then EASY → MEDIUM → HARD, so the same requirements always give
 * the same blueprint, whatever the order of `must_have`.
 */
export function buildDefaultBlueprint(
  requirements: Pick<JdRequirements, 'must_have'>,
  { durationMinutes }: { durationMinutes: number },
): ExamBlueprint {
  const defaults = EXAM_BLUEPRINT_DEFAULTS;
  const ranked: RankedSkill[] = requirements.must_have
    .map((item, position) => ({
      skill: item.skill.trim(),
      key: skillKey(item.skill),
      weight: Math.max(1, Math.round(item.weight * WEIGHT_SCALE)),
      position,
    }))
    .sort((a, b) => byText(a.key, b.key));
  if (ranked.length === 0) throw new Error('buildDefaultBlueprint needs at least one must-have skill');

  const percents = QUESTION_DIFFICULTIES.map((difficulty) => defaults.difficultyPercent[difficulty]);
  const rows = largestRemainder(
    defaults.A.questionCount,
    ranked.map((item) => item.weight),
  );
  const columns = largestRemainder(defaults.A.questionCount, percents);
  const grid = controlledRound(rows, columns, percents);

  const cellsA = ranked
    .map((item, i) => ({ item, line: grid[i] ?? [] }))
    .sort((a, b) => a.item.position - b.item.position)
    .flatMap(({ item, line }) =>
      QUESTION_DIFFICULTIES.flatMap((difficulty, j): BlueprintCell[] => {
        const count = line[j] ?? 0;
        return count > 0 ? [{ skill: item.skill, difficulty, count }] : [];
      }),
    );

  const essaySkills = [...ranked]
    .sort((a, b) => b.weight - a.weight || byText(a.key, b.key))
    .slice(0, defaults.B.skills);
  const essays = largestRemainder(
    defaults.B.questionCount,
    essaySkills.map(() => 1),
  );
  const cellsB = essaySkills.flatMap((item, i): BlueprintCell[] => {
    const count = essays[i] ?? 0;
    return count > 0 ? [{ skill: item.skill, difficulty: defaults.B.difficulty, count }] : [];
  });

  return {
    duration_minutes: durationMinutes,
    parts: {
      A: { weight_percent: defaults.A.weightPercent, question_count: defaults.A.questionCount, cells: cellsA },
      B: { weight_percent: defaults.B.weightPercent, question_count: defaults.B.questionCount, cells: cellsB },
    },
  };
}

/** One cell of a blueprint with the part and question type it belongs to. */
export interface BlueprintCellRef {
  part: ExamPart;
  type: QuestionType;
  skill: string;
  difficulty: QuestionDifficulty;
  count: number;
}

/** Every cell of the blueprint, part A first, in the order the blueprint lists them. */
export function cellsOf(blueprint: ExamBlueprint): BlueprintCellRef[] {
  return EXAM_PARTS.flatMap((part) =>
    blueprint.parts[part].cells.map((cell) => ({ part, type: EXAM_PART_TYPES[part], ...cell })),
  );
}

/** Questions the bank holds for one type, skill, difficulty and status, the skill as the AI wrote it. */
export interface QuestionCount {
  type: QuestionType;
  skill: string;
  difficulty: QuestionDifficulty;
  status: QuestionStatus;
  count: number;
}

/** REJECTED questions of one type, skill and difficulty that failed one check. */
export interface RejectReasonCount {
  type: QuestionType;
  skill: string;
  difficulty: QuestionDifficulty;
  reason: QuestionRejectReason;
  count: number;
}

/** Key of the cell a question falls in: its type, `skillKey` and difficulty. */
export const cellKeyOf = (type: QuestionType, skill: string, difficulty: QuestionDifficulty): string =>
  `${type}\u0000${skillKey(skill)}\u0000${difficulty}`;

/**
 * Whether a question falls in a cell of the blueprint, matched by `skillKey` as `coverageOf`
 * matches it: an exam draws no question of a cell the blueprint no longer has (US-4.2 AC-8, AC-11).
 */
export function blueprintCellFilter(
  blueprint: ExamBlueprint,
): (question: { type: QuestionType; skill: string; difficulty: QuestionDifficulty }) => boolean {
  const keys = new Set(cellsOf(blueprint).map((cell) => cellKeyOf(cell.type, cell.skill, cell.difficulty)));
  return (question) => keys.has(cellKeyOf(question.type, question.skill, question.difficulty));
}

interface CellTally {
  byStatus: Map<QuestionStatus, number>;
  reasons: Partial<Record<QuestionRejectReason, number>>;
}

/**
 * Questions per blueprint cell against the BR-05 bounds (US-4.1 AC-3, US-4.2 AC-4): a cell is
 * complete with `min` times the questions it draws VALIDATED, and holds at most `max` drafts.
 * Questions are matched to cells by `skillKey`; those of a cell the blueprint no longer has, such
 * as one of a skill the JD dropped (US-4.2 AC-11), are not counted anywhere.
 */
export function coverageOf(
  blueprint: ExamBlueprint,
  counts: readonly QuestionCount[],
  reasons: readonly RejectReasonCount[] = [],
): CellCoverage[] {
  const tallies = new Map<string, CellTally>();
  const tallyOf = (key: string): CellTally => {
    const known = tallies.get(key);
    if (known) return known;
    const tally: CellTally = { byStatus: new Map(), reasons: {} };
    tallies.set(key, tally);
    return tally;
  };
  for (const row of counts) {
    const { byStatus } = tallyOf(cellKeyOf(row.type, row.skill, row.difficulty));
    byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + row.count);
  }
  for (const row of reasons) {
    const tally = tallyOf(cellKeyOf(row.type, row.skill, row.difficulty));
    tally.reasons[row.reason] = (tally.reasons[row.reason] ?? 0) + row.count;
  }
  return cellsOf(blueprint).map((cell) => {
    const tally = tallies.get(cellKeyOf(cell.type, cell.skill, cell.difficulty));
    const of = (status: QuestionStatus): number => tally?.byStatus.get(status) ?? 0;
    return {
      part: cell.part,
      type: cell.type,
      skill: cell.skill,
      difficulty: cell.difficulty,
      needed: cell.count,
      drafted: [...(tally?.byStatus.values() ?? [])].reduce((acc, value) => acc + value, 0),
      validated: of('VALIDATED'),
      rejected: of('REJECTED'),
      pending: of('DRAFT'),
      rejectReasons: { ...tally?.reasons },
      min: cell.count * QUESTION_BANK_FACTORS.min,
      max: cell.count * QUESTION_BANK_FACTORS.max,
    };
  });
}
