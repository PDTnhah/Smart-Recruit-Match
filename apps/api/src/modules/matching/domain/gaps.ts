import type { MatchGap } from '@srm/shared';
import type { SkillVerdicts } from './skill-match.js';

/**
 * The JD skills a CV shows only in part or not at all (US-3.2 AC-12), listed by code from its
 * verdicts, never by the LLM: must-have first, each group in the order of the requirements.
 */
export function gapsOf(verdicts: SkillVerdicts): MatchGap[] {
  return (['must_have', 'nice_to_have'] as const).flatMap((group) =>
    verdicts[group].flatMap((verdict): MatchGap[] =>
      verdict.verdict === 'MET'
        ? []
        : [{ skill: verdict.skill, group, levelRequired: verdict.level_required, verdict: verdict.verdict }],
    ),
  );
}
