import { gapsOf } from '../gaps.js';
import { type JudgedPair, pairKeyOf, planCvPairs } from '../match-plan.js';
import { RULES_VERSION } from '../rules-version.js';
import { selectTopM } from '../select-top-m.js';
import { skillVerdict } from './fixtures/verdicts.js';

const candidate = (jdId: number, skillFitX100: number) => ({ jdId, skillFitX100 });

describe('GĐ3 top-M by skill_fit, ties by jd_id (US-3.2 AC-6, FR-40)', () => {
  it('GĐ3 top-M by skill_fit, ties by jd_id', () => {
    const candidates = [candidate(7, 6200), candidate(3, 8000), candidate(9, 6200), candidate(2, 6200), candidate(5, 100)];
    expect(selectTopM(candidates, 3).map((c) => c.jdId)).toEqual([3, 2, 7]);
    expect(selectTopM([...candidates].reverse(), 3)).toEqual(selectTopM(candidates, 3));
  });

  it('GĐ3 fewer candidates than M: all of them; M must be a positive integer', () => {
    expect(selectTopM([candidate(1, 0)], 10)).toEqual([candidate(1, 0)]);
    expect(selectTopM([], 10)).toEqual([]);
    expect(() => selectTopM([], 0)).toThrow(RangeError);
    expect(() => selectTopM([], 1.5)).toThrow(RangeError);
  });
});

const pair = (jdId: number, skillFitX100: number | null, change: Partial<JudgedPair> = {}): JudgedPair => ({
  cvId: 11,
  cvVersion: 2,
  jdId,
  jdVersion: 1,
  eligible: skillFitX100 !== null,
  skillFitX100,
  ...change,
});

const plan = (pairs: JudgedPair[], topM: number, done: JudgedPair[] = [], review: JudgedPair[] = []) =>
  planCvPairs({
    pairs,
    topM,
    done: new Set(done.map(pairKeyOf)),
    review: new Set(review.map(pairKeyOf)),
  }).map(({ pair: { jdId }, action }) => [jdId, action]);

describe('GĐ3 matching plan: what a run writes and sends (US-3.2 AC-1, AC-4, AC-6, AC-9)', () => {
  it('GĐ3 ineligible pairs are stored, the top M sent, the rest skipped', () => {
    const pairs = [pair(1, 5000), pair(2, null), pair(3, 9000), pair(4, 7000)];
    expect(plan(pairs, 2)).toEqual([
      [1, 'SKIPPED'],
      [2, 'INELIGIBLE'],
      [3, 'SEND'],
      [4, 'SEND'],
    ]);
  });

  it('BR-18 a pair scored with these versions is cached and still ranks; a new JD version is sent', () => {
    const scored = pair(3, 9000);
    const pairs = [pair(1, 5000), scored, pair(4, 7000, { jdVersion: 2 })];
    expect(plan(pairs, 2, [scored, pair(4, 7000)])).toEqual([
      [1, 'SKIPPED'],
      [3, 'CACHED'],
      [4, 'SEND'],
    ]);
  });

  it('GĐ3 a scored pair that drops out of the top M keeps its score', () => {
    const scored = pair(1, 5000);
    expect(plan([scored, pair(2, 9000)], 1, [scored])).toEqual([
      [1, 'CACHED'],
      [2, 'SEND'],
    ]);
  });

  it('GĐ3 a pair the LLM refused twice is not sent again', () => {
    const refused = pair(3, 9000);
    expect(plan([refused, pair(4, 7000)], 2, [], [refused])).toEqual([
      [3, 'REVIEW'],
      [4, 'SEND'],
    ]);
  });
});

describe('GĐ3 gaps and rules version (US-3.2 AC-4, AC-12)', () => {
  it('GĐ3 gaps list PARTIAL and NOT_MET skills, must-have first, in requirement order', () => {
    const gaps = gapsOf({
      must_have: [
        skillVerdict('Java', 'INTERMEDIATE', 'MET', 'Java'),
        skillVerdict('Docker', 'BASIC', 'NOT_MET', null),
        skillVerdict('SQL', 'BASIC', 'PARTIAL', 'MySQL'),
      ],
      nice_to_have: [skillVerdict('Redis', 'BASIC', 'NOT_MET', null)],
    });
    expect(gaps).toEqual([
      { skill: 'Docker', group: 'must_have', levelRequired: 'BASIC', verdict: 'NOT_MET' },
      { skill: 'SQL', group: 'must_have', levelRequired: 'BASIC', verdict: 'PARTIAL' },
      { skill: 'Redis', group: 'nice_to_have', levelRequired: 'BASIC', verdict: 'NOT_MET' },
    ]);
  });

  it('GĐ3 the rules version names every rule table a verdict rests on', () => {
    expect(RULES_VERSION).toBe('matching-rules/v1+language-cefr/v1+soft-skill-signals/v1');
  });
});
