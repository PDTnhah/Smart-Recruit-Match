import { CURRENT_TERMS, TERMS_V1 } from '@srm/shared';
import { canonicalJson, termsSha256 } from '../terms.js';

describe('NFR-2: terms fingerprint (CONTEXT D30)', () => {
  it('NFR-2: canonical JSON sorts keys at every level', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
  });

  it('NFR-2: the hash does not depend on key order', () => {
    const reordered = { sections: TERMS_V1.sections, title: TERMS_V1.title, version: TERMS_V1.version };
    expect(termsSha256(reordered)).toBe(termsSha256(TERMS_V1));
  });

  // Students accepted v1 by this hash. If this fails, v1 was edited in place: revert it and add
  // TERMS_V2 instead, so students accept the new text again.
  it('NFR-2: terms v1 is frozen', () => {
    expect(termsSha256(TERMS_V1)).toBe('54964d1e5eb5f8ffc8b080f222f59512be1a9479df8bec8ada1a37221bc817d2');
  });

  it('NFR-2: the current terms are v1', () => {
    expect(CURRENT_TERMS.version).toBe(1);
  });
});
