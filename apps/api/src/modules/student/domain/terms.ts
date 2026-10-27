import { createHash } from 'node:crypto';
import type { ConsentTerms } from '@srm/shared';

// Fingerprint of the terms text a student accepted (NFR-2, CONTEXT D30). Stored with each consent,
// so the record proves which wording was shown even after the source changes.

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, sortKeys(item)]),
    );
  }
  return value;
}

/** JSON with object keys sorted at every level, so the hash does not depend on key order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

/** Lower-case hex SHA-256 of the canonical JSON of the terms. */
export function termsSha256(terms: ConsentTerms): string {
  return createHash('sha256').update(canonicalJson(terms), 'utf8').digest('hex');
}
