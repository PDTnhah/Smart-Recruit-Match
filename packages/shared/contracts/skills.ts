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

// Skill taxonomy (FR-39, US-2.7, CONTEXT D42, D43). Code matches CV skills to JD skills by three
// facts ADMIN keeps on the catalogue: the zone (field of work) of a skill, its family (skills that
// can stand in for each other) and the skills it implies. No LLM or embedding decides them (AD-15).

/** Field of work of a skill; a skill's zone follows from its family. */
export const SKILL_ZONES = [
  'FOUNDATION',
  'BACKEND',
  'FRONTEND',
  'MOBILE',
  'DATABASE',
  'DATA_AI',
  'DEVOPS_CLOUD',
  'TESTING_QA',
  'BUSINESS_ANALYSIS',
  'PROCESS',
  'SECURITY_NETWORK',
  'EMBEDDED_IOT',
  'GAME_DEV',
  'BLOCKCHAIN',
  'SOFT_SKILL',
] as const;

export type SkillZone = (typeof SKILL_ZONES)[number];

/**
 * Family of skills that can stand in for each other, e.g. PostgreSQL and MySQL. A family may have
 * one skill, so a skill without a substitute still has a zone. The families of the SOFT_SKILL zone
 * are the standard soft-skill competencies (PRD › Kỹ năng mềm).
 */
export const SKILL_FAMILIES = [
  // FOUNDATION
  'SYSTEMS_LANGUAGE',
  'MANAGED_LANGUAGE',
  'SCRIPTING_LANGUAGE',
  'SOFTWARE_DESIGN',
  'ALGORITHMS',
  'VERSION_CONTROL',
  'IDE',
  'FOREIGN_LANGUAGE',
  // BACKEND
  'BACKEND_FRAMEWORK',
  'ORM',
  'WEB_API',
  'MESSAGE_BROKER',
  'SOFTWARE_ARCHITECTURE',
  'JVM_BUILD_TOOL',
  // FRONTEND
  'JS_TS',
  'WEB_MARKUP_STYLING',
  'SPA_FRAMEWORK',
  'META_FRAMEWORK',
  'DOM_LIBRARY',
  'STATE_MANAGEMENT',
  'FRONTEND_BUILD',
  'UI_DESIGN',
  // MOBILE
  'NATIVE_MOBILE_PLATFORM',
  'NATIVE_UI_TOOLKIT',
  'MOBILE_LANGUAGE',
  'CROSS_PLATFORM_MOBILE',
  // DATABASE
  'SQL',
  'RELATIONAL_DB',
  'NOSQL_DB',
  // DATA_AI
  'AI_FIELD',
  'ML_FRAMEWORK',
  'PYTHON_DATA_TOOL',
  'DATA_ANALYTICS',
  'NUMERIC_LANGUAGE',
  'BI_TOOL',
  'DATA_ENGINEERING',
  'BIG_DATA',
  // DEVOPS_CLOUD
  'CONTAINERIZATION',
  'CLOUD_PROVIDER',
  'CI_CD',
  'IAC',
  'LINUX_SHELL',
  'WEB_SERVER',
  'MONITORING',
  // TESTING_QA
  'MANUAL_QA',
  'TEST_AUTOMATION',
  'UNIT_TESTING',
  'API_TESTING',
  'PERFORMANCE_TESTING',
  // BUSINESS_ANALYSIS
  'REQUIREMENTS',
  'MODELING_NOTATION',
  // PROCESS
  'SOFTWARE_PROCESS',
  'PROJECT_TOOL',
  // SECURITY_NETWORK
  'NETWORKING',
  'INFORMATION_SECURITY',
  // EMBEDDED_IOT, GAME_DEV, BLOCKCHAIN
  'EMBEDDED_SYSTEMS',
  'GAME_ENGINE',
  'BLOCKCHAIN_PLATFORM',
  // SOFT_SKILL: the standard competencies
  'COMMUNICATION',
  'TEAMWORK',
  'LEADERSHIP',
  'PROBLEM_SOLVING',
  'PRESENTATION',
  'CRITICAL_THINKING',
  'SELF_LEARNING',
  'TIME_MANAGEMENT',
  'PROACTIVENESS',
  'RESPONSIBILITY',
  'ADAPTABILITY',
  'ATTENTION_TO_DETAIL',
] as const;

export type SkillFamily = (typeof SKILL_FAMILIES)[number];

/** The zone of each family. The Record type makes a family without a zone a compile error. */
export const FAMILY_ZONE: Readonly<Record<SkillFamily, SkillZone>> = {
  SYSTEMS_LANGUAGE: 'FOUNDATION',
  MANAGED_LANGUAGE: 'FOUNDATION',
  SCRIPTING_LANGUAGE: 'FOUNDATION',
  SOFTWARE_DESIGN: 'FOUNDATION',
  ALGORITHMS: 'FOUNDATION',
  VERSION_CONTROL: 'FOUNDATION',
  IDE: 'FOUNDATION',
  FOREIGN_LANGUAGE: 'FOUNDATION',
  BACKEND_FRAMEWORK: 'BACKEND',
  ORM: 'BACKEND',
  WEB_API: 'BACKEND',
  MESSAGE_BROKER: 'BACKEND',
  SOFTWARE_ARCHITECTURE: 'BACKEND',
  JVM_BUILD_TOOL: 'BACKEND',
  JS_TS: 'FRONTEND',
  WEB_MARKUP_STYLING: 'FRONTEND',
  SPA_FRAMEWORK: 'FRONTEND',
  META_FRAMEWORK: 'FRONTEND',
  DOM_LIBRARY: 'FRONTEND',
  STATE_MANAGEMENT: 'FRONTEND',
  FRONTEND_BUILD: 'FRONTEND',
  UI_DESIGN: 'FRONTEND',
  NATIVE_MOBILE_PLATFORM: 'MOBILE',
  NATIVE_UI_TOOLKIT: 'MOBILE',
  MOBILE_LANGUAGE: 'MOBILE',
  CROSS_PLATFORM_MOBILE: 'MOBILE',
  SQL: 'DATABASE',
  RELATIONAL_DB: 'DATABASE',
  NOSQL_DB: 'DATABASE',
  AI_FIELD: 'DATA_AI',
  ML_FRAMEWORK: 'DATA_AI',
  PYTHON_DATA_TOOL: 'DATA_AI',
  DATA_ANALYTICS: 'DATA_AI',
  NUMERIC_LANGUAGE: 'DATA_AI',
  BI_TOOL: 'DATA_AI',
  DATA_ENGINEERING: 'DATA_AI',
  BIG_DATA: 'DATA_AI',
  CONTAINERIZATION: 'DEVOPS_CLOUD',
  CLOUD_PROVIDER: 'DEVOPS_CLOUD',
  CI_CD: 'DEVOPS_CLOUD',
  IAC: 'DEVOPS_CLOUD',
  LINUX_SHELL: 'DEVOPS_CLOUD',
  WEB_SERVER: 'DEVOPS_CLOUD',
  MONITORING: 'DEVOPS_CLOUD',
  MANUAL_QA: 'TESTING_QA',
  TEST_AUTOMATION: 'TESTING_QA',
  UNIT_TESTING: 'TESTING_QA',
  API_TESTING: 'TESTING_QA',
  PERFORMANCE_TESTING: 'TESTING_QA',
  REQUIREMENTS: 'BUSINESS_ANALYSIS',
  MODELING_NOTATION: 'BUSINESS_ANALYSIS',
  SOFTWARE_PROCESS: 'PROCESS',
  PROJECT_TOOL: 'PROCESS',
  NETWORKING: 'SECURITY_NETWORK',
  INFORMATION_SECURITY: 'SECURITY_NETWORK',
  EMBEDDED_SYSTEMS: 'EMBEDDED_IOT',
  GAME_ENGINE: 'GAME_DEV',
  BLOCKCHAIN_PLATFORM: 'BLOCKCHAIN',
  COMMUNICATION: 'SOFT_SKILL',
  TEAMWORK: 'SOFT_SKILL',
  LEADERSHIP: 'SOFT_SKILL',
  PROBLEM_SOLVING: 'SOFT_SKILL',
  PRESENTATION: 'SOFT_SKILL',
  CRITICAL_THINKING: 'SOFT_SKILL',
  SELF_LEARNING: 'SOFT_SKILL',
  TIME_MANAGEMENT: 'SOFT_SKILL',
  PROACTIVENESS: 'SOFT_SKILL',
  RESPONSIBILITY: 'SOFT_SKILL',
  ADAPTABILITY: 'SOFT_SKILL',
  ATTENTION_TO_DETAIL: 'SOFT_SKILL',
};

/** The zone of a skill: that of its family; none without one. */
export function zoneOf(family: SkillFamily | null): SkillZone | null {
  return family === null ? null : FAMILY_ZONE[family];
}

/** Families of `zone`, in SKILL_FAMILIES order. */
export function familiesOfZone(zone: SkillZone): SkillFamily[] {
  return SKILL_FAMILIES.filter((family) => FAMILY_ZONE[family] === zone);
}

/** The standard soft-skill competencies. Only SOFT_SKILL skills take them (core.skills CHECK). */
export const SOFT_SKILL_FAMILIES: readonly SkillFamily[] = familiesOfZone('SOFT_SKILL');

/** Whether a skill of `group` may belong to `family`: soft skills ⇔ soft-skill families. */
export function familyFitsGroup(group: SkillGroup, family: SkillFamily): boolean {
  return (group === 'SOFT_SKILL') === (FAMILY_ZONE[family] === 'SOFT_SKILL');
}

/** Most skills one skill implies directly (CONTEXT D43). */
export const MAX_IMPLIED_SKILLS = 5;

/**
 * One approved skill as the `matching` module reads it (`SkillCatalogService.taxonomy()`, AC-8).
 * `impliedSkillIds` is the closure: every skill this one implies, directly or through others.
 */
export interface SkillTaxonomyEntry {
  skillId: number;
  canonicalName: string;
  nameKey: string;
  aliasKeys: string[];
  group: SkillGroup;
  family: SkillFamily | null;
  zone: SkillZone | null;
  /** Ascending. */
  impliedSkillIds: number[];
}
