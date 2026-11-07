import type { CellCoverage } from '@srm/shared';
import { type LockState, lockBlockers, missingCellsOf } from '../lock-readiness.js';

const cell = (validated: number, extra: Partial<CellCoverage> = {}): CellCoverage => ({
  part: 'A',
  type: 'MCQ',
  skill: 'Java',
  difficulty: 'EASY',
  needed: 2,
  drafted: validated + 3,
  validated,
  rejected: 2,
  pending: 1,
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

describe('GĐ5: question bank lock readiness (US-4.2 AC-6, AC-11)', () => {
  it('GĐ5 a bank with 3× VALIDATED questions in every cell can be locked', () => {
    expect(lockBlockers(ready)).toEqual([]);
    expect(missingCellsOf(ready.coverage)).toEqual([]);
  });

  it('GĐ5 a cell short of VALIDATED questions makes the bank INCOMPLETE; drafts and rejected ones do not count', () => {
    const coverage = [cell(5, { drafted: 12, pending: 4, rejected: 3 }), ready.coverage[1]!];
    expect(lockBlockers({ ...ready, coverage })).toEqual(['INCOMPLETE']);
    expect(missingCellsOf(coverage)).toEqual([
      { type: 'MCQ', skill: 'Java', difficulty: 'EASY', drafted: 12, validated: 5, required: 6 },
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
