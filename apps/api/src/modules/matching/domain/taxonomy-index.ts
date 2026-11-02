import type { SkillFamily, SkillTaxonomyEntry } from '@srm/shared';

// Lookups over the skill taxonomy (`SkillCatalogService.taxonomy()`, US-2.7) that skill matching
// needs. Built once per matching run and shared by every CV × JD pair (US-3.2).

export interface TaxonomyIndex {
  byId: ReadonlyMap<number, SkillTaxonomyEntry>;
  /**
   * Each name key and alias key to its skill. Should two skills share a key, a name key wins over
   * an alias key, then the smaller id, so the lookup is the same on every run.
   */
  byKey: ReadonlyMap<string, SkillTaxonomyEntry>;
  /** Every skill that implies the skill, directly or through others; ascending. */
  impliersOf: ReadonlyMap<number, readonly number[]>;
  /** Skills of each family; ascending. */
  familyMembers: ReadonlyMap<SkillFamily, readonly number[]>;
}

function append<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key);
  if (values === undefined) map.set(key, [value]);
  else values.push(value);
}

export function indexTaxonomy(taxonomy: readonly SkillTaxonomyEntry[]): TaxonomyIndex {
  const entries = [...taxonomy].sort((a, b) => a.skillId - b.skillId);
  const byKey = new Map<string, SkillTaxonomyEntry>();
  const keep = (key: string, entry: SkillTaxonomyEntry) => {
    if (key !== '' && !byKey.has(key)) byKey.set(key, entry);
  };
  for (const entry of entries) keep(entry.nameKey, entry);
  for (const entry of entries) for (const key of entry.aliasKeys) keep(key, entry);

  // Entries go in ascending id order, so every list below is ascending.
  const impliersOf = new Map<number, number[]>();
  const familyMembers = new Map<SkillFamily, number[]>();
  for (const entry of entries) {
    for (const implied of entry.impliedSkillIds) append(impliersOf, implied, entry.skillId);
    if (entry.family !== null) append(familyMembers, entry.family, entry.skillId);
  }
  return { byId: new Map(entries.map((entry) => [entry.skillId, entry])), byKey, impliersOf, familyMembers };
}
