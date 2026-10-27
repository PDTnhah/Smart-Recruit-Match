import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AiResultMessageSchema,
  MAX_SIMILAR_SKILLS,
  SkillNormalizeOutputSchema,
  SkillSuggestionsSchema,
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
