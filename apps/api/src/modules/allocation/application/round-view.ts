// Response shapes of a round (US-5.2 AC-7, AC-13), built from its row, its nominations and what
// other modules say of its students and JDs. No I/O here.

import type {
  AllocationExplanation,
  AllocationJdView,
  AllocationPreferenceOutcome,
  AllocationRoundSummary,
  AllocationRoundView,
  AllocationStabilityWarning,
  AllocationUnassignedView,
} from '@srm/shared';
import type { AllocationJd } from '../../company/index.js';
import type { StudentAllocationRecord } from '../../student/index.js';
import {
  type AllocationInputSnapshot,
  checkStability,
  compareCodeUnits,
  explainOutcome,
  type JdId,
  type OutcomeItem,
  type StudentId,
  snapshotToEngineInput,
} from '../domain/index.js';
import type { NominationRecord, RoundRecord } from '../infrastructure/allocation-round.repository.js';

export interface RoundContext {
  campaignName: string;
  students: ReadonlyMap<number, StudentAllocationRecord>;
  jds: ReadonlyMap<number, AllocationJd>;
}

const UNKNOWN_STUDENT: StudentAllocationRecord = { studentCode: '', fullName: '', gpa4: null };

/** Scores stay integers ×100 in the snapshot; responses carry them as stored (two decimals). */
const fromCenti = (value: number) => value / 100;

export function summaryOf(round: RoundRecord): AllocationRoundSummary {
  return {
    id: round.id,
    campaignId: round.campaignId,
    roundNo: round.roundNo,
    status: round.status,
    ranAt: round.ranAt.toISOString(),
    publishedAt: round.publishedAt?.toISOString() ?? null,
    rowVersion: round.rowVersion,
  };
}

/** The round's nominations by JD, best-ranked first; every JD of the snapshot is there. */
export function heldOf(
  snapshot: AllocationInputSnapshot,
  nominations: readonly NominationRecord[],
): Map<JdId, StudentId[]> {
  const held = new Map<JdId, StudentId[]>(snapshot.capacity.map((row) => [row.jdId, []]));
  for (const nomination of [...nominations].sort((a, b) => a.rank - b.rank || a.id - b.id)) {
    const jdId = String(nomination.jdId);
    const list = held.get(jdId) ?? [];
    list.push(String(nomination.studentId));
    held.set(jdId, list);
  }
  return held;
}

export function outcomeOf(item: OutcomeItem, jds: ReadonlyMap<number, AllocationJd>): AllocationPreferenceOutcome {
  const jd = jds.get(Number(item.jdId));
  return {
    preferenceRank: item.preferenceRank,
    jdId: Number(item.jdId),
    title: jd?.title ?? '',
    companyName: jd?.companyName ?? '',
    reason: item.reason,
    exclusionReasons: [...item.exclusionReasons],
  };
}

export function buildRoundView(
  round: RoundRecord,
  nominations: readonly NominationRecord[],
  context: RoundContext,
): AllocationRoundView {
  const snapshot = round.inputSnapshot;
  const held = heldOf(snapshot, nominations);
  const student = (id: number) => context.students.get(id) ?? UNKNOWN_STUDENT;
  const preferenceRankOf = new Map(snapshot.pairs.map((pair) => [`${pair.studentId}:${pair.jdId}`, pair.preferenceRank]));

  const jds = snapshot.capacity
    .map((row): AllocationJdView => {
      const jdId = Number(row.jdId);
      const jd = context.jds.get(jdId);
      const list = nominations.filter((nomination) => nomination.jdId === jdId).sort((a, b) => a.rank - b.rank);
      return {
        jdId,
        title: jd?.title ?? '',
        companyName: jd?.companyName ?? '',
        quota: row.quota,
        capacity: row.capacity,
        nominated: list.length,
        fillPercent: row.capacity === 0 ? null : Math.min(100, Math.floor((list.length * 100) / row.capacity)),
        short: list.length < row.capacity,
        nominations: list.map((nomination) => ({
          id: nomination.id,
          studentId: nomination.studentId,
          studentCode: student(nomination.studentId).studentCode,
          fullName: student(nomination.studentId).fullName,
          sFinal: nomination.sFinal,
          rank: nomination.rank,
          preferenceRank: preferenceRankOf.get(`${nomination.studentId}:${nomination.jdId}`) ?? 1,
          status: nomination.status,
          overrideReason: nomination.overrideReason,
        })),
      };
    })
    .sort((a, b) => compareCodeUnits(a.title, b.title) || a.jdId - b.jdId);

  const nominated = new Set(nominations.map((nomination) => nomination.studentId));
  const ranked = [...new Set(snapshot.pairs.map((pair) => Number(pair.studentId)))];
  const unassigned = ranked
    .filter((studentId) => !nominated.has(studentId))
    .map(
      (studentId): AllocationUnassignedView => ({
        studentId,
        studentCode: student(studentId).studentCode,
        fullName: student(studentId).fullName,
        preferences: explainOutcome(snapshot, held, String(studentId)).items.map((item) => outcomeOf(item, context.jds)),
      }),
    )
    .sort((a, b) => compareCodeUnits(a.studentCode, b.studentCode) || a.studentId - b.studentId);

  return {
    ...summaryOf(round),
    campaignName: context.campaignName,
    counts: {
      students: ranked.length,
      nominated: nominations.length,
      unassigned: unassigned.length,
      excludedPairs: snapshot.excluded.length,
    },
    jds,
    unassigned,
    adjustments: round.adjustments.map((adjustment) => ({
      ...adjustment,
      studentCode: student(adjustment.studentId).studentCode,
    })),
    warnings: stabilityWarnings(snapshot, held, student),
  };
}

/**
 * AC-8: pairs the nominations as they stand leave unstable, by `checkStability` over the snapshot.
 * The engine's own result has none; manual adjustments may add some, shown and never blocking.
 */
export function stabilityWarnings(
  snapshot: AllocationInputSnapshot,
  held: ReadonlyMap<JdId, readonly StudentId[]>,
  student: (id: number) => StudentAllocationRecord,
): AllocationStabilityWarning[] {
  return checkStability(snapshotToEngineInput(snapshot), { held }).violations.flatMap((violation) =>
    violation.type === 'BLOCKING_PAIR'
      ? [
          {
            studentId: Number(violation.student),
            studentCode: student(Number(violation.student)).studentCode,
            jdId: Number(violation.jd),
            outranksStudentId: violation.outranks === null ? null : Number(violation.outranks),
            outranksStudentCode: violation.outranks === null ? null : student(Number(violation.outranks)).studentCode,
          },
        ]
      : [],
  );
}

/** NFR-4 for the center: every figure behind each reason (AC-13). */
export function buildExplanation(
  round: RoundRecord,
  nominations: readonly NominationRecord[],
  studentId: number,
  context: RoundContext,
): AllocationExplanation {
  const outcome = explainOutcome(round.inputSnapshot, heldOf(round.inputSnapshot, nominations), String(studentId));
  const record = context.students.get(studentId) ?? UNKNOWN_STUDENT;
  return {
    roundId: round.id,
    studentId,
    studentCode: record.studentCode,
    fullName: record.fullName,
    nominatedJdId: outcome.nominatedJdId === null ? null : Number(outcome.nominatedJdId),
    items: outcome.items.map((item) => ({
      ...outcomeOf(item, context.jds),
      sFinal: item.sFinal === null ? null : fromCenti(item.sFinal),
      capacity: item.capacity,
      held: item.held,
      lowestHeld: item.lowestHeld
        ? { studentCode: item.lowestHeld.studentCode, sFinal: fromCenti(item.lowestHeld.sFinal) }
        : null,
    })),
  };
}

/** Every student and JD a round's snapshot names. */
export function idsOf(snapshot: AllocationInputSnapshot): { studentIds: number[]; jdIds: number[] } {
  const studentIds = new Set<number>();
  for (const pair of [...snapshot.pairs, ...snapshot.excluded]) studentIds.add(Number(pair.studentId));
  return { studentIds: [...studentIds], jdIds: snapshot.capacity.map((row) => Number(row.jdId)) };
}

export { fromCenti };
