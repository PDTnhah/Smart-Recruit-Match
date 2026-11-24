// The PRD example (PRD › Thuật toán phân bổ › Ví dụ minh họa) as a round snapshot (US-5.2): four
// students, quota A = 1, B = 2, C = 1, k = 1. Every rank field but S_final ties.

import { buildInputSnapshot, type AllocationInputSnapshot, type SnapshotPair } from '../snapshot.js';
import type { RankKey } from '../types.js';

export const PRD_S_FINAL: Record<string, Record<string, number>> = {
  An: { A: 8800, B: 8000 },
  Bình: { A: 9200, C: 7500 },
  Chi: { A: 7000, B: 8500, C: 7800 },
  Dũng: { B: 6500, C: 8200 },
};

const CODES: Record<string, string> = { An: 'SV01', Bình: 'SV02', Chi: 'SV03', Dũng: 'SV04' };

export function rankKey(student: string, sFinal: number, overrides: Partial<RankKey> = {}): RankKey {
  return { demoted: false, sFinal, sTest: 7000, sCv: 6000, gpa: 300, submittedAt: 0, studentCode: CODES[student] ?? student, ...overrides };
}

export function prdPairs(): SnapshotPair[] {
  return Object.entries(PRD_S_FINAL).flatMap(([student, scores], s) =>
    Object.entries(scores).map(([jd, sFinal], index) => ({
      studentId: student,
      jdId: jd,
      preferenceRank: index + 1,
      preferenceId: s * 10 + index + 1,
      rankKey: rankKey(student, sFinal),
      matching: { model: 'gemini-3.8-flash', promptVersion: 'matching/v1' },
      grading: [{ model: 'claude-opus-5-5', promptVersion: 'grader/v1' }],
    })),
  );
}

export function prdSnapshot(overrides: Partial<AllocationInputSnapshot> = {}): AllocationInputSnapshot {
  return buildInputSnapshot({
    roundNo: 1,
    pairs: prdPairs(),
    excluded: [],
    capacity: Object.entries({ A: 1, B: 2, C: 1 }).map(([jdId, quota]) => ({
      jdId,
      capacity: quota,
      quota,
      accepted: 0,
      inProcess: 0,
      k: 1,
      jdStatus: 'APPROVED',
    })),
    ...overrides,
  });
}
