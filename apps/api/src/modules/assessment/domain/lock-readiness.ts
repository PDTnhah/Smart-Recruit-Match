import type { CellCoverage, MissingCell, QuestionBankLockBlocker, QuestionBankStatus } from '@srm/shared';

// Whether CENTER may lock a question bank now (US-4.2 AC-6, AC-11, US-4.10 AC-4, CONTEXT D50, D60).
// Pure: no NestJS, no Drizzle. The view shows the blockers and the lock refuses with the first one,
// so both agree. Questions nobody has checked count: the lock does not wait for the Validator.

/** What the lock looks at, read under the bank's locks. */
export interface LockState {
  status: QuestionBankStatus;
  /** A run of the bank is RUNNING, generation or AI check. */
  generationRunning: boolean;
  /** The JD's requirements are newer than the bank's `jd_version` (BR-18). */
  jdOutdated: boolean;
  coverage: readonly CellCoverage[];
}

/** Cells with fewer usable questions (DRAFT or VALIDATED) than `min` (3× the questions they draw). */
export function missingCellsOf(coverage: readonly CellCoverage[]): MissingCell[] {
  return coverage
    .filter((cell) => cell.usable < cell.min)
    .map((cell) => ({
      type: cell.type,
      skill: cell.skill,
      difficulty: cell.difficulty,
      drafted: cell.drafted,
      validated: cell.validated,
      usable: cell.usable,
      required: cell.min,
    }));
}

/**
 * Every reason the bank cannot be locked, in the order the lock checks them; empty when it can.
 * A bank whose blueprint lists no cell is INCOMPLETE too: nothing could be drawn from it.
 */
export function lockBlockers(state: LockState): QuestionBankLockBlocker[] {
  const blockers: QuestionBankLockBlocker[] = [];
  if (state.status === 'LOCKED') blockers.push('LOCKED');
  if (state.generationRunning) blockers.push('GENERATION_RUNNING');
  if (state.jdOutdated) blockers.push('JD_OUTDATED');
  if (state.coverage.length === 0 || missingCellsOf(state.coverage).length > 0) blockers.push('INCOMPLETE');
  return blockers;
}
