/**
 * As many of `items` as fit in `max` characters, joined by `separator`, so a quote is cut between
 * items; the first item alone is cut only if it does not fit.
 */
export function joinWithin(items: readonly string[], separator: string, max: number): string {
  let joined = '';
  for (const item of items) {
    const next = joined === '' ? item : `${joined}${separator}${item}`;
    if (next.length > max) break;
    joined = next;
  }
  return joined === '' ? (items[0] ?? '').slice(0, max) : joined;
}
