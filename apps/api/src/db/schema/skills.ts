import { SKILL_GROUPS, SKILL_STATES, type SkillGroup, type SkillStatus, type SkillSuggestion } from '@srm/shared';
import { sql } from 'drizzle-orm';
import { type AnyPgColumn, check, index, jsonb, text } from 'drizzle-orm/pg-core';
import { id, oneOf, ref, rowVersion, timestamps } from './columns.js';
import { core } from './core.js';

// Skill catalogue (FR-13, US-2.5, CONTEXT D39). APPROVED rows are the catalogue, which the AI
// Service reads through core.v_ai_skills; PENDING rows are names the AI found outside it, waiting
// for ADMIN. A reviewed row stays, so its key keeps the name from being queued again.
export const skills = core.table(
  'skills',
  {
    id: id(),
    // The catalogue name once APPROVED; before that, the name as the CV or JD wrote it.
    canonicalName: text('canonical_name').notNull().unique(),
    // skillMatchKey(canonical_name): names with one key are one skill (AC-3).
    nameKey: text('name_key').notNull().unique(),
    // Other spellings matched to this skill.
    aliases: text('aliases')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // skillMatchKey of each alias, in order. With name_key, the trigger skills_keys_distinct
    // (migration 0017) keeps every key to one skill (Invariant 11).
    aliasKeys: text('alias_keys')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    group: text('group').$type<SkillGroup>(),
    status: text('status').$type<SkillStatus>().notNull().default('PENDING'),
    mergedIntoId: ref('merged_into_id').references((): AnyPgColumn => skills.id),
    // What the skill normalizer suggested (AC-6), with the model and prompt (Invariant 12).
    suggestion: jsonb('suggestion').$type<SkillSuggestion>(),
    suggestionModel: text('suggestion_model'),
    suggestionPromptVersion: text('suggestion_prompt_version'),
    rowVersion: rowVersion(),
    ...timestamps(),
  },
  (t) => [
    oneOf('skills_status_check', t.status, SKILL_STATES),
    oneOf('skills_group_check', t.group, SKILL_GROUPS),
    check('skills_canonical_name_check', sql`length(btrim(${t.canonicalName})) between 1 and 100`),
    check('skills_name_key_check', sql`${t.nameKey} <> ''`),
    check('skills_alias_keys_check', sql`cardinality(${t.aliasKeys}) = cardinality(${t.aliases})`),
    index('skills_alias_keys_idx').using('gin', t.aliasKeys),
    // The catalogue only holds grouped skills (Invariant 11).
    check('skills_approved_group_check', sql`${t.status} <> 'APPROVED' or ${t.group} is not null`),
    // A merged skill names its target. One way only: the merge sets the target, then transitionTo
    // moves the status, and only transitionTo writes `status` (AD-8).
    check('skills_merged_check', sql`${t.status} <> 'MERGED' or ${t.mergedIntoId} is not null`),
    check('skills_merged_into_self_check', sql`${t.mergedIntoId} <> ${t.id}`),
    check(
      'skills_suggestion_check',
      sql`(${t.suggestion} is null) = (${t.suggestionModel} is null) and (${t.suggestion} is null) = (${t.suggestionPromptVersion} is null)`,
    ),
  ],
);
