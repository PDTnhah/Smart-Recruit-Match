import type { CellCoverage } from '@srm/shared';
import { type LockState, lockBlockers, missingCellsOf } from '../lock-readiness.js';

/** A cell holding `usable` questions: one of them not checked yet, the others VALIDATED. */
const cell = (usable: number, extra: Partial<CellCoverage> = {}): CellCoverage => ({
  part: 'A',
  type: 'MCQ',
  skill: 'Java',
  difficulty: 'EASY',
  needed: 2,
  drafted: usable + 2,
  validated: Math.max(usable - 1, 0),
  rejected: 2,
  pending: Math.min(usable, 1),
  usable,
  rejectReasons: { ANSWER_MISMATCH: 2 },
  min: 6,
  max: 10,
  ...extra,
});

const ready: LockState = {
  status: 'OPEN',
  generationRunning: false,
  jdOutdated: false,
  coverage: [cell(6), cell(3, { skill: 'SQL', needed: 1, min: 3, max: 5 })],
};

describe('GĐ5: question bank lock readiness (US-4.2 AC-6, AC-11, US-4.10 AC-4)', () => {
  it('GĐ5 a bank with 3× usable questions in every cell can be locked', () => {
    expect(lockBlockers(ready)).toEqual([]);
    expect(missingCellsOf(ready.coverage)).toEqual([]);
  });

  it('GĐ5 US-4.10 questions nobody checked count: 3× DRAFT questions are enough to lock', () => {
    const unchecked = cell(6, { validated: 0, pending: 6 });
    expect(lockBlockers({ ...ready, coverage: [unchecked] })).toEqual([]);
  });

  it('GĐ5 a cell short of usable questions makes the bank INCOMPLETE; rejected ones do not count', () => {
    const coverage = [cell(5, { drafted: 12, validated: 1, pending: 4, rejected: 7 }), ready.coverage[1]!];
    expect(lockBlockers({ ...ready, coverage })).toEqual(['INCOMPLETE']);
    expect(missingCellsOf(coverage)).toEqual([
      { type: 'MCQ', skill: 'Java', difficulty: 'EASY', drafted: 12, validated: 1, usable: 5, required: 6 },
    ]);
  });

  it('GĐ5 a blueprint without cells cannot be locked', () => {
    expect(lockBlockers({ ...ready, coverage: [] })).toEqual(['INCOMPLETE']);
  });

  it('GĐ5 BR-18 lists every blocker in the order the lock checks them', () => {
    expect(
      lockBlockers({ status: 'LOCKED', generationRunning: true, jdOutdated: true, coverage: [cell(0)] }),
    ).toEqual(['LOCKED', 'GENERATION_RUNNING', 'JD_OUTDATED', 'INCOMPLETE']);
    expect(lockBlockers({ ...ready, jdOutdated: true })).toEqual(['JD_OUTDATED']);
    expect(lockBlockers({ ...ready, generationRunning: true })).toEqual(['GENERATION_RUNNING']);
  });
});
