import { CURRENT_TERMS, TERMS_V1, TERMS_V2 } from '@srm/shared';
import { canonicalJson, termsSha256 } from '../terms.js';

describe('NFR-2: terms fingerprint (CONTEXT D30)', () => {
  it('NFR-2: canonical JSON sorts keys at every level', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
  });

  it('NFR-2: the hash does not depend on key order', () => {
    const reordered = { sections: TERMS_V1.sections, title: TERMS_V1.title, version: TERMS_V1.version };
    expect(termsSha256(reordered)).toBe(termsSha256(TERMS_V1));
  });

  // Students accepted each version by this hash. If one fails, that version was edited in place:
  // revert it and add the next version instead, so students accept the new text again.
  it('NFR-2: terms v1 is frozen', () => {
    expect(termsSha256(TERMS_V1)).toBe('54964d1e5eb5f8ffc8b080f222f59512be1a9479df8bec8ada1a37221bc817d2');
  });

  it('NFR-2: terms v2 is frozen (US-2.4, CONTEXT D37)', () => {
    expect(termsSha256(TERMS_V2)).toBe('923eb2017153ab40920cd8bcee63baf7040aac5fce64a0c9e5ca38e9099e9f31');
  });

  it('NFR-2: the current terms are v2', () => {
    expect(CURRENT_TERMS.version).toBe(2);
  });
});
