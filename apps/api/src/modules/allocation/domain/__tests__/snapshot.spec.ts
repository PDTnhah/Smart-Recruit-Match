import { checkStability } from '../check-stability.js';
import { deferredAcceptance } from '../deferred-acceptance.js';
import {
  type AllocationInputSnapshot,
  buildConfigSnapshot,
  buildInputSnapshot,
  canonicalJson,
  snapshotToEngineInput,
  toStoredResult,
} from '../snapshot.js';
import { prdPairs, prdSnapshot } from './prd-snapshot.js';

// US-5.2 AC-3 (BR-17).
const ALLOWED_KEYS = new Set([
  'roundNo', 'pairs', 'excluded', 'capacity', 'studentId', 'jdId', 'preferenceRank', 'preferenceId', 'rankKey', 'matching', 'grading',
  'model', 'promptVersion', 'demoted', 'sFinal', 'sTest', 'sCv', 'gpa', 'submittedAt', 'studentCode', 'reasons',
  'hardFilterCodes', 'quota', 'accepted', 'inProcess', 'k', 'jdStatus',
]);

function keysOf(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => keysOf(item, into));
  else if (value && typeof value === 'object') {
    for (const [key, field] of Object.entries(value)) {
      into.add(key);
      keysOf(field, into);
    }
  }
  return into;
}

describe('round snapshot (US-5.2 AC-3)', () => {
  it('BR-17 snapshot is deterministic and PII-free', () => {
    const snapshot = prdSnapshot();
    const shuffled = prdSnapshot({
      pairs: prdPairs()
        .reverse()
        .map((pair) => ({ ...pair, grading: [...pair.grading, ...pair.grading] })),
      capacity: [...snapshot.capacity].reverse(),
    });
    expect(canonicalJson(buildInputSnapshot(shuffled))).toBe(canonicalJson(snapshot));
    expect([...keysOf(snapshot)].filter((key) => !ALLOWED_KEYS.has(key))).toEqual([]);
    expect(canonicalJson(buildConfigSnapshot({ k: 1.5, alpha: 0.4, target: { majors: ['CNTT'] } }, '0.33.0'))).toBe(
      '{"config":{"alpha":0.4,"k":1.5,"target":{"majors":["CNTT"]}},"systemVersion":"0.33.0"}',
    );
  });

  it('BR-17 the snapshot alone gives the PRD result again', () => {
    const input = snapshotToEngineInput(JSON.parse(canonicalJson(prdSnapshot())) as AllocationInputSnapshot);
    const result = deferredAcceptance(input);
    expect(checkStability(input, result).ok).toBe(true);
    expect(toStoredResult(result)).toEqual({
      held: [
        { jdId: 'A', students: ['Bình'] },
        { jdId: 'B', students: ['Chi', 'An'] },
        { jdId: 'C', students: ['Dũng'] },
      ],
      unassigned: [],
    });
  });
});
