// fast-check generator of allocation inputs (US-5.1 AC-13), shared with US-5.2, US-5.5 and US-6.4.
// Scores come from a few levels so that ties reach every tie-break, down to student_code.

import fc from 'fast-check';
import { buildCompareAt } from '../compare.js';
import type { AllocationInput, JdId, RankKey, StudentId } from '../types.js';

export interface ArbAllocationOptions {
  /** Most students (default 30). */
  maxStudents?: number;
  /** Most JDs (default 8). */
  maxJds?: number;
  /** Longest preference list (default: every JD). Any length from 0 up to it is generated. */
  maxPreferences?: number;
  /** Largest capacity (default 4). Capacity 0 and a JD missing from `capacity` are generated too. */
  maxCapacity?: number;
  /** Values each score, the GPA and the submission time can take (default 2): fewer, more ties. */
  scoreLevels?: number;
  /** Share of demoted students (BR-16), 0–1 (default 0.2). */
  demotedRate?: number;
}

export interface AllocationScenario {
  /** `compareAt` is `buildCompareAt(rankKeys)`. */
  input: AllocationInput;
  /** A key for every (JD, student) pair of the preferences, nothing else. */
  rankKeys: Map<JdId, Map<StudentId, RankKey>>;
}

const SUBMITTED_AT_BASE = Date.UTC(2026, 10, 1);

/** Student `st-<i>` gets a student_code from a shuffled list, so code order differs from id order. */
export function arbAllocationInput(options: ArbAllocationOptions = {}): fc.Arbitrary<AllocationScenario> {
  const { maxStudents = 30, maxJds = 8, maxCapacity = 4, scoreLevels = 2, demotedRate = 0.2 } = options;
  const maxPreferences = options.maxPreferences ?? maxJds;
  const level = fc.integer({ min: 0, max: scoreLevels - 1 });
  const demotedPercent = Math.round(demotedRate * 100);

  return fc
    .record({ jdCount: fc.integer({ min: 0, max: maxJds }), studentCount: fc.integer({ min: 0, max: maxStudents }) })
    .chain(({ jdCount, studentCount }) => {
      const jds = Array.from({ length: jdCount }, (_, i) => `jd-${i}`);
      const codes = Array.from({ length: studentCount }, (_, i) => `SV${String(i).padStart(4, '0')}`);
      const pairKey = fc.record({
        sFinal: level.map((l) => 6000 + 50 * l),
        sTest: level.map((l) => 7000 + 50 * l),
        sCv: level.map((l) => 5000 + 50 * l),
        submittedAt: level.map((l) => SUBMITTED_AT_BASE + 60_000 * l),
      });
      const student = fc.record({
        preferences: fc.shuffledSubarray(jds, { maxLength: Math.min(maxPreferences, jdCount) }),
        demoted: fc.integer({ min: 0, max: 99 }).map((n) => n < demotedPercent),
        gpa: fc.option(level.map((l) => 300 + 25 * l), { freq: 5 }), // null 1 time in 5
        keys: fc.array(pairKey, { minLength: jdCount, maxLength: jdCount }),
      });
      return fc.record({
        // -1: the JD is left out of `capacity`
        capacities: fc.array(fc.integer({ min: -1, max: maxCapacity }), { minLength: jdCount, maxLength: jdCount }),
        students: fc.array(student, { minLength: studentCount, maxLength: studentCount }),
        codes: fc.shuffledSubarray(codes, { minLength: studentCount, maxLength: studentCount }),
      });
    })
    .map(({ capacities, students, codes }) => {
      const capacity = new Map<JdId, number>();
      capacities.forEach((seats, j) => {
        if (seats >= 0) capacity.set(`jd-${j}`, seats);
      });
      const preferences = new Map<StudentId, JdId[]>();
      const rankKeys = new Map<JdId, Map<StudentId, RankKey>>();
      capacities.forEach((_, j) => rankKeys.set(`jd-${j}`, new Map()));
      students.forEach(({ preferences: jds, demoted, gpa, keys }, i) => {
        const id = `st-${i}`;
        preferences.set(id, jds);
        for (const jd of jds) {
          const pair = keys[Number(jd.slice(3))];
          if (pair) rankKeys.get(jd)?.set(id, { ...pair, demoted, gpa, studentCode: codes[i] ?? id });
        }
      });
      return { input: { preferences, capacity, compareAt: buildCompareAt(rankKeys) }, rankKeys };
    });
}
