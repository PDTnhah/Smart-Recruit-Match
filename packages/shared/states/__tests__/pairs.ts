import { canTransition, type StateMachine } from '../machine.js';

/**
 * Compares a machine against an edge list written independently from the PRD, over every
 * (from, to) pair, so the test does not just restate the table it checks.
 * Returns the pairs where the machine disagrees with the expected edges.
 */
export function mismatchedPairs<S extends string>(
  machine: StateMachine<S>,
  expectedEdges: ReadonlyArray<readonly [S, S]>,
): string[] {
  const expected = new Set(expectedEdges.map(([from, to]) => `${from} -> ${to}`));
  const mismatches: string[] = [];
  for (const from of machine.states) {
    for (const to of machine.states) {
      const key = `${from} -> ${to}`;
      if (canTransition(machine, from, to) !== expected.has(key)) {
        mismatches.push(`${key}: expected ${expected.has(key) ? 'allowed' : 'rejected'}`);
      }
    }
  }
  return mismatches;
}
