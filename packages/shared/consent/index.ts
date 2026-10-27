import type { ConsentTerms } from './terms.js';
import { TERMS_V2 } from './terms-v2.js';

export type { ConsentTerms, ConsentTermsSection } from './terms.js';
export { TERMS_V1 } from './terms-v1.js';
export { TERMS_V2 } from './terms-v2.js';

/**
 * The version students accept from now on (CONTEXT D30). Point it at a new version to require
 * re-consent. v2 names Google as well as Anthropic (CONTEXT D37); a consent to v1 no longer lets a
 * student submit a CV.
 */
export const CURRENT_TERMS: ConsentTerms = TERMS_V2;
