import { EXAM_PARTS, type ExamBlueprint, type ExamPart, type QuestionDifficulty, type QuestionType } from '@srm/shared';
import { cellKeyOf, cellsOf } from './blueprint.js';

// The sample of a question bank HR or CENTER review (FR-19, US-4.9 AC-1). Pure: no DB, no clock.

/** A question the sample may hold. */
export interface ReviewCandidate {
  id: number;
  type: QuestionType;
  skill: string;
  difficulty: QuestionDifficulty;
}

export interface ReviewSampleInput<T extends ReviewCandidate> {
  candidates: readonly T[];
  blueprint: ExamBlueprint;
  /** The most questions drawn. */
  size: number;
  /** The same seed and candidates give the same sample. */
  seed: number;
  /**
   * Questions someone already reviewed: always in the sample, over `size` if need be, so a size
   * lowered after the reviews never hides one.
   */
  keep?: ReadonlySet<number>;
}

export interface SampledQuestion<T extends ReviewCandidate> {
  part: ExamPart;
  question: T;
}

interface SampleCell<T> {
  part: ExamPart;
  /** Place of the cell in the blueprint: the display order. */
  index: number;
  rank: number;
  pool: T[];
}

/** murmur3's 32-bit finaliser: spreads every input bit over the output. */
function mix32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85eb_ca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2_ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Where a question falls in its cell's random order: a function of the seed and its id alone. */
function rankOfId(seed: number, id: number): number {
  const low = id % 2 ** 32;
  const high = Math.floor(id / 2 ** 32);
  return mix32(seed ^ mix32(low ^ mix32(high + 0x9e37_79b9)));
}

/** FNV-1a of the cell key, mixed with the seed: the cell's place in each round. */
function rankOfKey(seed: number, key: string): number {
  let h = 0x811c_9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x0100_0193);
  }
  return mix32(seed ^ mix32(h));
}

const byRankThenId = <T extends { rank: number; id: number }>(a: T, b: T): number => a.rank - b.rank || a.id - b.id;

/**
 * US-4.9 AC-1: up to `size` questions of the blueprint's cells, matched by `skillKey` as an exam
 * draw matches them. Each cell orders its questions by a hash of the seed and the question id, and
 * the cells give one question each in turn: every cell has one before any has two. In each turn the
 * essay cells (part B) come first, then part A, each part in an order the seed decides, so a sample
 * smaller than the blueprint still holds the essays. Since a question's place in its cell depends on
 * its own id only, a question added to or dropped from a cell moves at most one question of the
 * sample: a reload, or a review that retires a question, keeps the rest. Questions of `keep` the draw
 * left out are added at their place in their cell. Returned in display order:
 * part A then B, cells as the blueprint lists them.
 */
export function drawReviewSample<T extends ReviewCandidate>({
  candidates,
  blueprint,
  size,
  seed,
  keep = new Set<number>(),
}: ReviewSampleInput<T>): SampledQuestion<T>[] {
  const cells = new Map<string, SampleCell<T>>();
  for (const [index, cell] of cellsOf(blueprint).entries()) {
    const key = cellKeyOf(cell.type, cell.skill, cell.difficulty);
    // A key listed twice is one pool, as in the exam draw.
    if (!cells.has(key)) cells.set(key, { part: cell.part, index, rank: rankOfKey(seed, key), pool: [] });
  }

  const seen = new Set<number>();
  const ranked = new Map<SampleCell<T>, { rank: number; id: number; question: T }[]>();
  for (const question of candidates) {
    if (seen.has(question.id)) continue;
    seen.add(question.id);
    const cell = cells.get(cellKeyOf(question.type, question.skill, question.difficulty));
    if (!cell) continue;
    const entries = ranked.get(cell) ?? [];
    entries.push({ rank: rankOfId(seed, question.id), id: question.id, question });
    ranked.set(cell, entries);
  }
  for (const [cell, entries] of ranked) cell.pool = entries.sort(byRankThenId).map((entry) => entry.question);

  const partOrder = (part: ExamPart) => (part === 'B' ? 0 : 1);
  const turnOrder = [...cells.values()].sort(
    (a, b) => partOrder(a.part) - partOrder(b.part) || a.rank - b.rank || a.index - b.index,
  );

  const picked: { cell: SampleCell<T>; round: number; question: T }[] = [];
  for (let round = 0; picked.length < size; round += 1) {
    let progressed = false;
    for (const cell of turnOrder) {
      if (picked.length >= size) break;
      const question = cell.pool[round];
      if (question === undefined) continue;
      picked.push({ cell, round, question });
      progressed = true;
    }
    if (!progressed) break;
  }
  const pickedIds = new Set(picked.map(({ question }) => question.id));
  for (const cell of turnOrder) {
    for (const [round, question] of cell.pool.entries()) {
      if (keep.has(question.id) && !pickedIds.has(question.id)) picked.push({ cell, round, question });
    }
  }

  return picked
    .sort(
      (a, b) =>
        EXAM_PARTS.indexOf(a.cell.part) - EXAM_PARTS.indexOf(b.cell.part) ||
        a.cell.index - b.cell.index ||
        a.round - b.round,
    )
    .map(({ cell, question }) => ({ part: cell.part, question }));
}
