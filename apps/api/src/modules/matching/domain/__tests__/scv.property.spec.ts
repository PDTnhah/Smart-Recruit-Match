import type { MajorMatch, MatchCriteria, MatchSkillVerdict, MatchVerdict, ScvWeights } from '@srm/shared';
import fc from 'fast-check';
import { computeScv, type ScvInput } from '../scv.js';

const SKILLS = ['Java', 'SQL', 'Docker', 'Redis', 'React', 'Python', 'Git', 'Linux', 'AWS', 'Kafka'];

const verdict = fc.constantFrom<MatchVerdict>('MET', 'PARTIAL', 'NOT_MET');

/** Five weights in hundredths that sum to 1, as the campaign config schema requires. */
const weights = fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 4, maxLength: 4 }).map((cuts): ScvWeights => {
  const edges = [0, ...cuts.sort((a, b) => a - b), 100];
  const part = (i: number) => (edges[i + 1]! - edges[i]!) / 100;
  return {
    scv_weight_must_have: part(0),
    scv_weight_nice_to_have: part(1),
    scv_weight_project: part(2),
    scv_weight_education: part(3),
    scv_weight_language: part(4),
  };
});

/** A JD with 1–10 skills and a verdict, or none, for each; any project score, major, GPA and weights. */
const scenario = fc.uniqueArray(fc.constantFrom(...SKILLS), { minLength: 1, maxLength: SKILLS.length }).chain((names) =>
  fc.record({
    names: fc.constant(names),
    mustCount: fc.integer({ min: 1, max: names.length }),
    skillWeights: fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: names.length, maxLength: names.length }),
    verdicts: fc.array(fc.option(verdict, { nil: undefined }), { minLength: names.length, maxLength: names.length }),
    project: fc.integer({ min: 0, max: 4 }),
    major: fc.constantFrom<MajorMatch>('EXACT', 'RELATED', 'OTHER'),
    gpaX100: fc.option(fc.integer({ min: 0, max: 400 }), { nil: null }),
    requiresLanguage: fc.boolean(),
    language: fc.option(verdict, { nil: null }),
    weights,
  }),
);

type Scenario = typeof scenario extends fc.Arbitrary<infer T> ? T : never;

const item = (skill: string, value: MatchVerdict): MatchSkillVerdict => ({
  skill,
  level_required: 'BASIC',
  verdict: value,
  evidence: value === 'NOT_MET' ? null : `Dự án dùng ${skill}`,
});

function toInput(s: Scenario): ScvInput {
  const skills = s.names.map((skill, i) => ({ skill, level: 'BASIC' as const, weight: s.skillWeights[i]! / 100 }));
  const judged = s.names.flatMap((skill, i) => (s.verdicts[i] === undefined ? [] : [item(skill, s.verdicts[i])]));
  const criteria: MatchCriteria = {
    must_have: judged.filter((v) => s.names.indexOf(v.skill) < s.mustCount),
    nice_to_have: judged.filter((v) => s.names.indexOf(v.skill) >= s.mustCount),
    project_relevance: { score_0_4: s.project, reason: '...' },
    education: { major_match: s.major },
    language: s.language === null ? null : { verdict: s.language, evidence: s.language === 'NOT_MET' ? null : 'TOEIC 650' },
  };
  return {
    requirements: {
      must_have: skills.slice(0, s.mustCount),
      nice_to_have: skills.slice(s.mustCount),
      hard_conditions: {
        majors: [],
        min_study_year: null,
        min_gpa: null,
        required_languages: s.requiresLanguage ? ['Tiếng Anh'] : [],
      },
    },
    criteria,
    education: { gpa4: s.gpaX100 === null ? null : s.gpaX100 / 100 },
    weights: s.weights,
  };
}

const UPGRADE: Readonly<Record<MatchVerdict, MatchVerdict>> = { NOT_MET: 'PARTIAL', PARTIAL: 'MET', MET: 'MET' };

describe('GĐ3 AD-2 S_cv properties (US-3.1 AC-7)', () => {
  it('GĐ3 AD-2 S_cv bounded, monotonic and deterministic', () => {
    fc.assert(
      fc.property(scenario, fc.nat(), (s, pick) => {
        const before = computeScv(toInput(s)).scvX100;
        expect(Number.isInteger(before)).toBe(true);
        expect(before).toBeGreaterThanOrEqual(0);
        expect(before).toBeLessThanOrEqual(10_000);

        // Same input, same result, whatever the order of the verdicts.
        const again = toInput(s);
        again.criteria.must_have.reverse();
        again.criteria.nice_to_have.reverse();
        expect(computeScv(again)).toEqual(computeScv(toInput(s)));

        // Raising one skill verdict (an omitted skill counts NOT_MET) never lowers S_cv.
        const i = pick % s.names.length;
        const raised = { ...s, verdicts: s.verdicts.map((v, j) => (j === i ? UPGRADE[v ?? 'NOT_MET'] : v)) };
        expect(computeScv(toInput(raised)).scvX100).toBeGreaterThanOrEqual(before);

        // Nor does a higher project score or a better language verdict.
        const project = { ...s, project: Math.min(s.project + 1, 4) };
        expect(computeScv(toInput(project)).scvX100).toBeGreaterThanOrEqual(before);
        const language = { ...s, language: UPGRADE[s.language ?? 'NOT_MET'] };
        expect(computeScv(toInput(language)).scvX100).toBeGreaterThanOrEqual(before);
      }),
      { numRuns: 500 },
    );
  });
});
