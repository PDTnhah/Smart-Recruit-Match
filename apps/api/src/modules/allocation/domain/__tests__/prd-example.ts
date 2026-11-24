// PRD › Thuật toán phân bổ › Ví dụ minh họa: 4 students, 3 JDs, quota A = 1, B = 2, C = 1, k = 1.
// Preferences in NV order with the S_final of each pair; every other rank field ties.

import { computeCapacity } from '../capacity.js';
import { buildCompareAt } from '../compare.js';
import { toCentiScore } from '../score.js';
import type { AllocationInput, JdId, RankKey, StudentId } from '../types.js';

const S_FINAL: Record<StudentId, Record<JdId, number>> = {
  An: { A: 88, B: 80 },
  Bình: { A: 92, C: 75 },
  Chi: { A: 70, B: 85, C: 78 },
  Dũng: { B: 65, C: 82 },
};
const QUOTA: Record<JdId, number> = { A: 1, B: 2, C: 1 };

export function prdExample(): AllocationInput {
  const rankKeys = new Map<JdId, Map<StudentId, RankKey>>();
  for (const jd of Object.keys(QUOTA)) rankKeys.set(jd, new Map());
  Object.entries(S_FINAL).forEach(([student, scores], i) => {
    for (const [jd, sFinal] of Object.entries(scores)) {
      rankKeys.get(jd)?.set(student, {
        demoted: false,
        sFinal: toCentiScore(sFinal),
        sTest: 7000,
        sCv: 6000,
        gpa: 300,
        submittedAt: 0,
        studentCode: `SV0${i + 1}`,
      });
    }
  });
  return {
    preferences: new Map(Object.entries(S_FINAL).map(([student, scores]) => [student, Object.keys(scores)])),
    capacity: new Map(
      Object.entries(QUOTA).map(([jd, quota]) => [jd, computeCapacity({ quota, accepted: 0, inProcess: 0, k: 1 })]),
    ),
    compareAt: buildCompareAt(rankKeys),
  };
}
