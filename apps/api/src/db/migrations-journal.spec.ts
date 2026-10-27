import { readFileSync } from 'node:fs';
import path from 'node:path';

interface Journal {
  entries: { idx: number; when: number; tag: string }[];
}

const journal = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../drizzle/meta/_journal.json'), 'utf8'),
) as Journal;

describe('AD-9: migration journal stays applicable', () => {
  // drizzle's migrator only applies migrations whose `when` is newer than the last applied one, so a
  // migration generated on a parallel branch with an older timestamp would be skipped silently.
  it('has strictly increasing idx and when', () => {
    journal.entries.forEach((entry, i) => {
      expect(entry.idx).toBe(i);
      if (i > 0) expect(entry.when).toBeGreaterThan(journal.entries[i - 1]!.when);
    });
  });

  it('names each migration file after its idx', () => {
    for (const entry of journal.entries) {
      expect(entry.tag.startsWith(String(entry.idx).padStart(4, '0') + '_')).toBe(true);
    }
  });
});
