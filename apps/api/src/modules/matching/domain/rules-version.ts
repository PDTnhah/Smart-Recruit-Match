import { LANGUAGE_CEFR_VERSION } from './language-cefr.js';
import { MATCHING_RULES_VERSION } from './matching-rules.js';
import { SOFT_SKILL_SIGNALS_VERSION } from './soft-skill-signals.js';

/**
 * The code rules every stored verdict rests on (US-3.2 AC-4, CONTEXT D44–D46): the evidence tiers,
 * the CEFR table and the soft-skill signals. Raising any of them gives new rows instead of
 * overwriting old ones, so a stored score is always explained by the rules that produced it.
 */
export const RULES_VERSION = [MATCHING_RULES_VERSION, LANGUAGE_CEFR_VERSION, SOFT_SKILL_SIGNALS_VERSION].join('+');
