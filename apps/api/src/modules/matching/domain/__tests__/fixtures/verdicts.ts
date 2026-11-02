import type { MatchSkillVerdict, MatchVerdict, SkillLevel } from '@srm/shared';

/**
 * A skill verdict whose match fields agree with its verdict (US-3.5 AC-12), for tests that only
 * read the verdict and the evidence: met skills match EXACT, unmet ones NONE.
 */
export function skillVerdict(
  skill: string,
  level_required: SkillLevel,
  verdict: MatchVerdict,
  evidence: string | null,
): MatchSkillVerdict {
  const met = verdict !== 'NOT_MET';
  return {
    skill,
    level_required,
    verdict,
    evidence,
    match_kind: met ? 'EXACT' : 'NONE',
    tier: verdict === 'MET' ? 4 : met ? 1 : 0,
    via: null,
    sources: [],
  };
}
