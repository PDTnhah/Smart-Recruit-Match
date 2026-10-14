import type { ConsentTerms } from './terms.js';
import { TERMS_V1 } from './terms-v1.js';

export type { ConsentTerms, ConsentTermsSection } from './terms.js';
export { TERMS_V1 } from './terms-v1.js';

/** The version students accept from now on (CONTEXT D30). Point it at a new version to require re-consent. */
export const CURRENT_TERMS: ConsentTerms = TERMS_V1;
