import {
  EXAM_PARTS,
  type ExamBlueprint,
  type ExamOptionLayout,
  type ExamOptionSlot,
  type ExamPart,
  type QuestionDifficulty,
  type QuestionType,
} from '@srm/shared';
import { cellKeyOf, cellsOf } from './blueprint.js';

// The paper of one exam session (BR-05, PRD GĐ5, US-4.3 AC-1, AC-2, CONTEXT D51). Pure: no NestJS,
// no Drizzle, no clock and no CV. The questions, their order and the order of the options come from
// the seed, so the same bank version and seed always give the same paper, whatever the order the
// questions come in. The opaque option codes do not: they reach the client, and one output of
// mulberry32 gives its whole stream away, hence the original place of every option (AC-3). They come
// from `codes`, a cryptographic source in the service.

/** What the draw reads of a question: no content, no answer key. */
export interface DrawCandidate {
  id: number;
  type: QuestionType;
  skill: string;
  difficulty: QuestionDifficulty;
  /** Options of an MCQ; 0 for an essay. */
  optionCount: number;
}

export interface DrawExamInput {
  questions: readonly DrawCandidate[];
  blueprint: ExamBlueprint;
  /** A non-negative 32-bit integer. */
  seed: number;
  /** Uniform integers in [0, OPTION_CODE_SPACE), apart from the seed: one per option code. */
  codes: () => number;
}

export interface ExamDraw {
  /** Display order: part A, then part B, each shuffled. */
  questionIds: number[];
  /** Option order and opaque codes of each MCQ, by question id; server only (AGENTS › Invariant 8). */
  optionLayout: ExamOptionLayout;
  durationMinutes: number;
}

/** A blueprint cell with fewer drawable questions than it draws, e.g. after a question was retired. */
export interface ShortCell {
  part: ExamPart;
  type: QuestionType;
  skill: string;
  difficulty: QuestionDifficulty;
  needed: number;
  available: number;
}

export type DrawExamResult = { ok: true; draw: ExamDraw } | { ok: false; shortCells: ShortCell[] };

/** Length of an option code; 36^6 codes, drawn again on the rare clash within a question. */
const OPTION_CODE_LENGTH = 6;
export const OPTION_CODE_SPACE = 36 ** OPTION_CODE_LENGTH;

/** mulberry32: a small 32-bit PRNG, uniform enough for shuffling; returns values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Fisher–Yates on a copy. */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

function optionSlots(optionCount: number, random: () => number, codes: () => number): ExamOptionSlot[] {
  const used = new Set<string>();
  return shuffle(
    Array.from({ length: optionCount }, (_, index) => index),
    random,
  ).map((index) => {
    let code: string;
    do {
      code = codes().toString(36).padStart(OPTION_CODE_LENGTH, '0');
    } while (used.has(code));
    used.add(code);
    return { code, index };
  });
}

interface CellNeed {
  part: ExamPart;
  type: QuestionType;
  skill: string;
  difficulty: QuestionDifficulty;
  count: number;
}

/**
 * AC-1, AC-2 (BR-05): draws `count` questions of every blueprint cell, matched by `skillKey` as
 * `blueprintCellFilter` matches them, then shuffles part A and part B on their own and the options
 * of each MCQ. Within a cell the candidates are sorted by id before the shuffle, so the input order
 * does not matter. A cell short of questions fails the whole draw: no paper is ever smaller than its
 * blueprint (409 `EXAM_BANK_INCOMPLETE`).
 */
export function drawExam({ questions, blueprint, seed, codes }: DrawExamInput): DrawExamResult {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error(`drawExam needs a 32-bit non-negative seed, got ${seed}`);
  }
  const random = mulberry32(seed);

  // A key listed twice draws from one pool, so no question can come out twice.
  const needs = new Map<string, CellNeed>();
  for (const cell of cellsOf(blueprint)) {
    const key = cellKeyOf(cell.type, cell.skill, cell.difficulty);
    const known = needs.get(key);
    if (known) known.count += cell.count;
    else needs.set(key, { ...cell });
  }

  const pools = new Map<string, DrawCandidate[]>();
  const seen = new Set<number>();
  for (const question of questions) {
    if (seen.has(question.id)) continue;
    seen.add(question.id);
    const key = cellKeyOf(question.type, question.skill, question.difficulty);
    if (!needs.has(key)) continue;
    const pool = pools.get(key);
    if (pool) pool.push(question);
    else pools.set(key, [question]);
  }

  const shortCells: ShortCell[] = [];
  const picked = new Map<ExamPart, DrawCandidate[]>(EXAM_PARTS.map((part) => [part, []]));
  for (const [key, need] of needs) {
    const pool = (pools.get(key) ?? []).sort((a, b) => a.id - b.id);
    if (pool.length < need.count) {
      const { part, type, skill, difficulty, count } = need;
      shortCells.push({ part, type, skill, difficulty, needed: count, available: pool.length });
      continue;
    }
    picked.get(need.part)?.push(...shuffle(pool, random).slice(0, need.count));
  }
  if (shortCells.length > 0) return { ok: false, shortCells };

  const ordered = EXAM_PARTS.flatMap((part) => shuffle(picked.get(part) ?? [], random));
  const optionLayout: ExamOptionLayout = {};
  for (const question of ordered) {
    if (question.type === 'MCQ') optionLayout[String(question.id)] = optionSlots(question.optionCount, random, codes);
  }
  return {
    ok: true,
    draw: {
      questionIds: ordered.map((question) => question.id),
      optionLayout,
      durationMinutes: blueprint.duration_minutes,
    },
  };
}
