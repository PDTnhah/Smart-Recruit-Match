import { compareSkillFit, type SkillFitCandidate } from './skill-fit.js';

/**
 * The M JDs of one CV the Matching Agent scores (US-3.2 AC-6, FR-40): the best skill_fit first,
 * equal skill_fit by `jdId` ascending, so the same pairs are chosen on every run. Pass the pairs
 * that passed the hard filter.
 */
export function selectTopM<T extends SkillFitCandidate>(candidates: readonly T[], m: number): T[] {
  if (!Number.isInteger(m) || m < 1) throw new RangeError(`top M must be a positive integer, got ${m}`);
  return [...candidates].sort(compareSkillFit).slice(0, m);
}
