// BR-17 (US-5.2 AC-3): a round keeps what it ran on, so it can be run again with the same result
// when a student complains. The snapshot holds IDs, student codes and numbers only, never a name or
// an email; arrays are sorted and `canonicalJson` sorts keys, so the same input always serializes
// to the same text.

import { buildCompareAt, compareCodeUnits } from './compare.js';
import type { ExclusionReason } from './eligibility.js';
import { InvalidAllocationInputError } from './errors.js';
import type { AllocationInput, AllocationResult, JdId, RankKey, StudentId } from './types.js';

/** The AI result an input rests on (BR-17, AGENTS › Invariant 12). */
export interface AiProvenance {
  model: string;
  promptVersion: string;
}

/** A pair the engine ranks: an eligible preference with its rank key at the JD. */
export interface SnapshotPair {
  studentId: StudentId;
  jdId: JdId;
  preferenceRank: number;
  /** `preferences.id` of the pair: a nomination refers to it. */
  preferenceId: number;
  rankKey: RankKey;
  /** The Matching Agent's result S_cv came from; null when it had no LLM part. */
  matching: AiProvenance | null;
  /** The Grader passes of the test's essays, distinct, sorted; empty without an essay graded by AI. */
  grading: AiProvenance[];
}

/** A preference BR-07 kept out, with why (AC-2) and what scores it had (×100). */
export interface SnapshotExclusion {
  studentId: StudentId;
  jdId: JdId;
  preferenceRank: number;
  reasons: ExclusionReason[];
  /** Codes of the pair's `ineligible_reasons` (`MAJOR_NOT_ALLOWED`…); empty when it passed. */
  hardFilterCodes: string[];
  sCv: number | null;
  sTest: number | null;
  sFinal: number | null;
}

/** C_j and what it was computed from (PRD GĐ10: ⌈(quota − accepted) × k⌉ − inProcess). */
export interface SnapshotCapacity {
  jdId: JdId;
  capacity: number;
  quota: number;
  accepted: number;
  inProcess: number;
  k: number;
  /** The JD's status when the round ran; one that takes no student has capacity 0. */
  jdStatus: string;
}

export interface AllocationInputSnapshot {
  roundNo: number;
  /** By student, then NV rank: each student's valid preferences in order. */
  pairs: SnapshotPair[];
  /** By student, then NV rank. */
  excluded: SnapshotExclusion[];
  /** By JD. */
  capacity: SnapshotCapacity[];
}

/** `campaigns.config` as the round read it (θ_cv, θ_test, α, β, k, N_NV…) and the system version. */
export interface AllocationConfigSnapshot {
  config: Record<string, unknown>;
  systemVersion: string;
}

/** The engine's own output, before any manual adjustment, as JSON. */
export interface StoredEngineResult {
  /** By JD; each list best-ranked first. */
  held: { jdId: JdId; students: StudentId[] }[];
  unassigned: StudentId[];
}

const byStudentThenRank = (
  a: { studentId: StudentId; preferenceRank: number },
  b: { studentId: StudentId; preferenceRank: number },
) => compareCodeUnits(a.studentId, b.studentId) || a.preferenceRank - b.preferenceRank;

const byProvenance = (a: AiProvenance, b: AiProvenance) =>
  compareCodeUnits(a.model, b.model) || compareCodeUnits(a.promptVersion, b.promptVersion);

/** Sorts every list, so equal content gives an equal snapshot whatever order it was read in. */
export function buildInputSnapshot(input: AllocationInputSnapshot): AllocationInputSnapshot {
  const pairs = input.pairs
    .map((pair) => ({ ...pair, rankKey: { ...pair.rankKey }, grading: distinctProvenance(pair.grading) }))
    .sort(byStudentThenRank);
  const excluded = input.excluded
    .map((pair) => ({ ...pair, reasons: [...pair.reasons], hardFilterCodes: [...pair.hardFilterCodes].sort(compareCodeUnits) }))
    .sort(byStudentThenRank);
  const capacity = input.capacity.map((row) => ({ ...row })).sort((a, b) => compareCodeUnits(a.jdId, b.jdId));
  assertUnique(
    [...pairs, ...excluded].map((pair) => `${pair.studentId}:${pair.preferenceRank}`),
    'student has two preferences of one rank',
  );
  assertUnique(
    capacity.map((row) => row.jdId),
    'JD listed twice in capacity',
  );
  return { roundNo: input.roundNo, pairs, excluded, capacity };
}

export function buildConfigSnapshot(config: Record<string, unknown>, systemVersion: string): AllocationConfigSnapshot {
  return { config: sortKeys(config) as Record<string, unknown>, systemVersion };
}

/** What the engine runs on, read from the snapshot alone: `replayRound` uses nothing else. */
export function snapshotToEngineInput(snapshot: AllocationInputSnapshot): AllocationInput {
  const preferences = new Map<StudentId, JdId[]>();
  const rankKeys = new Map<JdId, Map<StudentId, RankKey>>();
  for (const pair of [...snapshot.pairs].sort(byStudentThenRank)) {
    const list = preferences.get(pair.studentId);
    if (list) list.push(pair.jdId);
    else preferences.set(pair.studentId, [pair.jdId]);
    let keys = rankKeys.get(pair.jdId);
    if (!keys) {
      keys = new Map();
      rankKeys.set(pair.jdId, keys);
    }
    keys.set(pair.studentId, pair.rankKey);
  }
  return {
    preferences,
    capacity: new Map(snapshot.capacity.map((row) => [row.jdId, row.capacity])),
    compareAt: buildCompareAt(rankKeys),
  };
}

export function toStoredResult(result: AllocationResult): StoredEngineResult {
  return {
    held: [...result.held.entries()]
      .sort(([a], [b]) => compareCodeUnits(a, b))
      .map(([jdId, students]) => ({ jdId, students: [...students] })),
    unassigned: [...result.unassigned].sort(compareCodeUnits),
  };
}

/** JSON with object keys sorted at every level; arrays keep their order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, field]) => field !== undefined)
    .sort(([a], [b]) => compareCodeUnits(a, b));
  return Object.fromEntries(entries.map(([key, field]) => [key, sortKeys(field)]));
}

function distinctProvenance(list: readonly AiProvenance[]): AiProvenance[] {
  const seen = new Map<string, AiProvenance>();
  for (const item of list) seen.set(`${item.model}\u0000${item.promptVersion}`, { model: item.model, promptVersion: item.promptVersion });
  return [...seen.values()].sort(byProvenance);
}

function assertUnique(keys: readonly string[], message: string): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) throw new InvalidAllocationInputError(`${message}: ${key}`);
    seen.add(key);
  }
}
