import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AiResultMessageSchema,
  FAMILY_ZONE,
  MAX_SIMILAR_SKILLS,
  SKILL_FAMILIES,
  SKILL_ZONES,
  SOFT_SKILL_FAMILIES,
  SkillNormalizeOutputSchema,
  SkillSuggestionsSchema,
  familiesOfZone,
  familyFitsGroup,
  skillMatchKey,
} from '../index.js';

interface KeyCase {
  name: string;
  key: string;
}

const keyCases = (
  JSON.parse(readFileSync(join(__dirname, '../fixtures/skill-key-cases.json'), 'utf8')) as { cases: KeyCase[] }
).cases;

const suggestion = { skill_id: 7, canonical_name: 'React Native', group: 'FRAMEWORK', similar_skills: ['React'] };

describe('US-2.5 skillMatchKey: one key per skill name (AC-3)', () => {
  it.each(keyCases)('GĐ2 "$name" has key "$key"', ({ name, key }) => {
    expect(skillMatchKey(name)).toBe(key);
  });

  it('GĐ2 ReactJS, React.js and react js share one key; React has its own', () => {
    const keys = new Set(['ReactJS', 'React.js', 'react js'].map(skillMatchKey));
    expect(keys.size).toBe(1);
    expect(keys.has(skillMatchKey('React'))).toBe(false);
  });

  it('GĐ2 C, C++ and C# stay three skills', () => {
    expect(new Set(['C', 'C++', 'C#'].map(skillMatchKey)).size).toBe(3);
  });
});

describe('US-2.5 SKILL_NORMALIZE suggestions (AC-6)', () => {
  it('AC-6 a suggestion has a canonical name, a group and at most 5 similar skills', () => {
    expect(SkillSuggestionsSchema.parse({ suggestions: [suggestion] })).toEqual({ suggestions: [suggestion] });
    expect(SkillSuggestionsSchema.safeParse({ suggestions: [{ ...suggestion, group: 'Framework' }] }).success).toBe(
      false,
    );
    const many = Array.from({ length: MAX_SIMILAR_SKILLS + 1 }, (_, i) => `Skill ${i}`);
    expect(SkillSuggestionsSchema.safeParse({ suggestions: [{ ...suggestion, similar_skills: many }] }).success).toBe(
      false,
    );
    expect(SkillSuggestionsSchema.safeParse({ suggestions: [{ ...suggestion, canonical_name: '  ' }] }).success).toBe(
      false,
    );
  });

  it('AC-6 the result names its model and prompt and travels on ai.results (Invariant 12)', () => {
    const jobId = '7f6c1e2a-4b8d-4c1e-9a2b-3c4d5e6f7a8b';
    const output = { prompt_version: 'skill_normalizer/v1', model: 'gemini-3.8-flash', suggestions: [suggestion] };
    expect(SkillNormalizeOutputSchema.parse(output)).toEqual(output);
    expect(SkillNormalizeOutputSchema.safeParse({ suggestions: [suggestion] }).success).toBe(false);
    const message = {
      job_id: jobId,
      type: 'SKILL_NORMALIZE',
      status: 'SUCCEEDED',
      job: { job_id: jobId, skill_ids: [7] },
      result: output,
      error: null,
    };
    expect(AiResultMessageSchema.safeParse(message).success).toBe(true);
  });
});

describe('US-2.7 skill zones and families (AC-1, CONTEXT D43)', () => {
  it('FR-39 every family belongs to exactly one zone', () => {
    expect(new Set(SKILL_FAMILIES).size).toBe(SKILL_FAMILIES.length);
    expect(Object.keys(FAMILY_ZONE).sort()).toEqual([...SKILL_FAMILIES].sort());
    for (const family of SKILL_FAMILIES) expect(SKILL_ZONES).toContain(FAMILY_ZONE[family]);
  });

  it('FR-39 15 zones and 70 families; every zone has a family, listed in zone order', () => {
    expect(SKILL_ZONES).toHaveLength(15);
    expect(SKILL_FAMILIES).toHaveLength(70);
    for (const zone of SKILL_ZONES) expect(familiesOfZone(zone).length).toBeGreaterThan(0);
    expect(SKILL_ZONES.flatMap(familiesOfZone)).toEqual(SKILL_FAMILIES);
  });

  it('FR-39 the SOFT_SKILL zone holds the 12 standard competencies', () => {
    expect(SOFT_SKILL_FAMILIES).toEqual([
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
    ]);
    expect(FAMILY_ZONE.FOREIGN_LANGUAGE).toBe('FOUNDATION');
  });

  it.each([
    ['SOFT_SKILL', 'TEAMWORK', true],
    ['SOFT_SKILL', 'RELATIONAL_DB', false],
    ['DATABASE', 'RELATIONAL_DB', true],
    ['DATABASE', 'TEAMWORK', false],
    ['OTHER', 'FOREIGN_LANGUAGE', true],
  ] as const)('FR-39 a %s skill fits family %s: %s', (group, family, fits) => {
    expect(familyFitsGroup(group, family)).toBe(fits);
  });
});
