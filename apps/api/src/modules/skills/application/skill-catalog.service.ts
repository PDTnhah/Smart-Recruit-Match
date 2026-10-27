import { Injectable } from '@nestjs/common';
import type { CatalogSkill } from '@srm/shared';
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
}
