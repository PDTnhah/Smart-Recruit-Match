import { Injectable } from '@nestjs/common';
import { type CatalogSkill, skillMatchKey } from '@srm/shared';
import { SkillRepository } from '../infrastructure/skill.repository.js';

/**
 * Lookup in the approved skill catalogue (FR-13, US-2.5 AC-8, CONTEXT D39), exported for the
 * skill fields of the student profile (US-2.6), the JD form and matching. Skills awaiting review
 * are never returned.
 */
@Injectable()
export class SkillCatalogService {
  constructor(private readonly repository: SkillRepository) {}

  /** Approved skills whose name or alias contains `query`, best match first; all when empty. */
  search(query: string | undefined, limit: number): Promise<CatalogSkill[]> {
    return this.repository.search(query, limit);
  }

  /**
   * The approved skill each of `names` maps to by key, as the AI Service maps them (US-2.5 AC-3):
   * match key -> catalogue name. A name no approved name or alias shares a key with is left out.
   * For the skills a student edits in their profile (US-2.6, CONTEXT D40).
   */
  async matchKeys(names: readonly string[]): Promise<Map<string, string>> {
    const keys = new Set(names.map(skillMatchKey).filter((key) => key !== ''));
    const byKey = new Map<string, string>();
    for (const skill of await this.repository.approvedByKeys([...keys])) {
      for (const key of [skill.nameKey, ...skill.aliasKeys]) {
        if (keys.has(key)) byKey.set(key, skill.canonicalName);
      }
    }
    return byKey;
  }
}
