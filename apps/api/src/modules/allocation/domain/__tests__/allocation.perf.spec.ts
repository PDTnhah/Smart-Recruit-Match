import { checkStability } from '../check-stability.js';
import { buildCompareAt } from '../compare.js';
import { deferredAcceptance } from '../deferred-acceptance.js';
import type { AllocationInput, JdId, RankKey, StudentId } from '../types.js';

// US-5.1 AC-12, NFR-8: engine plus stability check under 1 s for 5,000 students × 3 preferences ×
// 200 JDs (ARCHITECTURE › Allocation Engine). Best of three runs, to keep a busy machine from failing it.
const STUDENTS = 5_000;
const JDS = 200;
const PREFERENCES = 3;

/** mulberry32: a fixed input on every machine. */
function seeded(seed: number): (max: number) => number {
  let state = seed;
  return (max) => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4_294_967_296) * max);
  };
}

function largeInput(): AllocationInput {
  const random = seeded(51);
  const jds = Array.from({ length: JDS }, (_, j) => `jd-${j}`);
  const rankKeys = new Map<JdId, Map<StudentId, RankKey>>(jds.map((jd) => [jd, new Map<StudentId, RankKey>()]));
  const preferences = new Map<StudentId, JdId[]>();
  for (let i = 0; i < STUDENTS; i += 1) {
    const student = `st-${i}`;
    const chosen = new Set<JdId>();
    // Skewed toward the first JDs, so popular JDs reject many proposals.
    while (chosen.size < PREFERENCES) chosen.add(jds[Math.min(random(JDS), random(JDS))] as JdId);
    preferences.set(student, [...chosen]);
    for (const jd of chosen) {
      rankKeys.get(jd)?.set(student, {
        demoted: random(20) === 0,
        sFinal: 4000 + random(6001),
        sTest: 4000 + random(6001),
        sCv: 5000 + random(5001),
        gpa: random(10) === 0 ? null : 200 + random(201),
        submittedAt: 1_700_000_000_000 + random(86_400_000),
        studentCode: `SV${String(i).padStart(5, '0')}`,
      });
    }
  }
  return {
    preferences,
    capacity: new Map(jds.map((jd) => [jd, 1 + random(40)])),
    compareAt: buildCompareAt(rankKeys),
  };
}

describe('Allocation Engine performance (US-5.1 AC-12)', () => {
  it('NFR-8 engine runs 5,000 students × 3 preferences × 200 JDs under 1s', () => {
    const input = largeInput();
    const timings = [0, 1, 2].map(() => {
      const start = performance.now();
      const report = checkStability(input, deferredAcceptance(input));
      const elapsed = performance.now() - start;
      expect(report.ok).toBe(true);
      return elapsed;
    });
    console.info(`US-5.1 AC-12: best ${Math.min(...timings).toFixed(1)} ms of ${timings.map((t) => t.toFixed(1)).join(', ')}`);
    expect(Math.min(...timings)).toBeLessThan(1000);
  });
});
