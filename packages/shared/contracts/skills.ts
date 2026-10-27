import { z } from 'zod';

// Skill catalogue (PRD GĐ2 step 3, FR-13, US-2.5, CONTEXT D39). Skill names in CV profiles and JD
// requirements are mapped to one catalogue: first by the key of a catalogue name or alias, then by
// embedding cosine at or above SKILL_MATCH_THRESHOLD, else the name is NEW. ADMIN approves new
// skills; the LLM only suggests a canonical name and group for them (AD-2).

/** Group of a catalogue skill; the admin screen shows them in Vietnamese. */
export const SKILL_GROUPS = [
  'LANGUAGE',
  'FRAMEWORK',
  'DATABASE',
  'CLOUD_DEVOPS',
  'TOOL',
  'TESTING',
  'DATA_AI',
  'METHODOLOGY',
  'SOFT_SKILL',
  'OTHER',
] as const;

export type SkillGroup = (typeof SKILL_GROUPS)[number];

/** How a skill name was mapped to the catalogue. */
export const SKILL_MATCHES = ['ALIAS', 'EMBEDDING', 'NEW'] as const;

export type SkillMatch = (typeof SKILL_MATCHES)[number];

/** Most new skills one SKILL_NORMALIZE job suggests for. */
export const SKILL_NORMALIZE_BATCH = 50;

/** Most similar catalogue skills one suggestion names. */
export const MAX_SIMILAR_SKILLS = 5;

export const SkillGroupSchema = z.enum(SKILL_GROUPS).meta({
  title: 'SkillGroup',
  description:
    'LANGUAGE = programming or markup language, FRAMEWORK = framework or library, DATABASE, ' +
    'CLOUD_DEVOPS = cloud, containers, CI/CD, TOOL = tool or platform, TESTING, ' +
    'DATA_AI = data analysis, data engineering, machine learning, METHODOLOGY = process or practice, ' +
    'SOFT_SKILL, OTHER',
});

export const SkillMatchSchema = z.enum(SKILL_MATCHES).meta({
  title: 'SkillMatch',
  description:
    'ALIAS = its key equals the key of a catalogue name or alias, EMBEDDING = cosine to a catalogue ' +
    'skill at or above the threshold, NEW = not in the catalogue',
});

const KEY_SEPARATORS = /[\s._/-]+/gu;

/**
 * Key two skill names are matched by: NFKC, lower case, without whitespace, dots, hyphens,
 * underscores and slashes, so "ReactJS", "React.js" and "react js" share one key. `+` and `#` stay
 * ("C++", "C#"). ai-service/app/embedding/skill_key.py is the same function; both are tested with
 * contracts/fixtures/skill-key-cases.json.
 */
export function skillMatchKey(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(KEY_SEPARATORS, '');
}

const skillName = () => z.string().trim().min(1).max(100);

export const SkillSuggestionSchema = z
  .strictObject({
    skill_id: z.int().positive().describe('Id of the new skill, exactly as given'),
    canonical_name: skillName().describe(
      'Proposed catalogue name: the usual official spelling of the skill, e.g. "React" for "reactjs"',
    ),
    group: SkillGroupSchema,
    similar_skills: z
      .array(skillName())
      .max(MAX_SIMILAR_SKILLS)
      .describe('Catalogue skills that may be the same skill, each by its exact catalogue name; empty when none'),
  })
  .meta({ title: 'SkillSuggestion', description: 'Suggestion for one new skill; ADMIN decides (FR-13)' });

export type SkillSuggestion = z.output<typeof SkillSuggestionSchema>;

/** What the skill normalizer asks the LLM for (AC-6). */
export const SkillSuggestionsSchema = z
  .strictObject({
    suggestions: z
      .array(SkillSuggestionSchema)
      .max(SKILL_NORMALIZE_BATCH)
      .describe('One suggestion per new skill'),
  })
  .meta({ title: 'SkillSuggestions', description: 'Structured output of the skill normalizer' });

export type SkillSuggestions = z.output<typeof SkillSuggestionsSchema>;
