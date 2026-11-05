import { type CompetitionLevel, type CompetitionThresholds, type JdCompetition, toHundredths } from '@srm/shared';

// Competition level of GĐ4 step 2 (FR-17, US-3.4, CONTEXT D48): a count of preferences against the
// quota, decided by code alone (AGENTS › Invariant 2). Pure: no NestJS, no Drizzle (Invariant 13).

function assertCounts(nvCount: number, quota: number): void {
  if (!Number.isInteger(quota) || quota < 1) throw new RangeError(`quota must be a positive integer, got ${quota}`);
  if (!Number.isInteger(nvCount) || nvCount < 0) {
    throw new RangeError(`preference count must be a non-negative integer, got ${nvCount}`);
  }
}

/**
 * LOW when preferences / quota is below `low_below`, HIGH from `high_from` on, MEDIUM in between
 * (AC-1). The thresholds become integers ×100 and are compared with `nvCount × 100` against
 * `threshold × quota`, never by dividing (AGENTS › Invariant 9): a ratio equal to a threshold takes
 * the higher level.
 */
export function competitionLevel(nvCount: number, quota: number, thresholds: CompetitionThresholds): CompetitionLevel {
  assertCounts(nvCount, quota);
  const scaled = nvCount * 100;
  if (scaled < toHundredths(thresholds.low_below) * quota) return 'LOW';
  if (scaled >= toHundredths(thresholds.high_from) * quota) return 'HIGH';
  return 'MEDIUM';
}

/** What a student sees of a JD's competition: the count, the quota and the level they give. */
export function jdCompetition(nvCount: number, quota: number, thresholds: CompetitionThresholds): JdCompetition {
  return { nvCount, quota, level: competitionLevel(nvCount, quota, thresholds) };
}

/** Fewer preferences than places (preferences / quota < 1): center staff are told (AC-5). */
export function isLowPreferenceJd(nvCount: number, quota: number): boolean {
  assertCounts(nvCount, quota);
  return nvCount < quota;
}
