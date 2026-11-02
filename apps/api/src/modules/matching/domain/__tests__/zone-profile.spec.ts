import type { JdSkillRequirement, SkillLevel } from '@srm/shared';
import { zoneCoverage } from '../zone-profile.js';
import { INDEX } from './fixtures/taxonomy.js';
import { skillVerdict } from './fixtures/verdicts.js';

const req = (skill: string, weight: number, level: SkillLevel = 'BASIC'): JdSkillRequirement => ({ skill, level, weight });

describe('GĐ3 zone coverage: demand weight and MET/PARTIAL coverage by zone (US-3.5 AC-9)', () => {
  it('GĐ3 every zone the JD needs, in zone order; skills without a family or outside the catalogue are in none', () => {
    const requirements = {
      must_have: [
        req('Spring Boot', 3),
        req('Java', 2),
        req('SQL', 1),
        req('Docker', 1),
        req('Agile', 1),
        req('Bun', 1),
      ],
      nice_to_have: [req('Redis', 1), req('Teamwork', 1.5)],
    };
    const verdicts = {
      must_have: [
        skillVerdict('Spring Boot', 'BASIC', 'PARTIAL', 'Spring Boot'),
        skillVerdict('Java', 'BASIC', 'MET', 'Java'),
        skillVerdict('SQL', 'BASIC', 'MET', 'MySQL'),
        skillVerdict('Docker', 'BASIC', 'NOT_MET', null),
        skillVerdict('Agile', 'BASIC', 'MET', 'Agile'),
        skillVerdict('Bun', 'BASIC', 'MET', 'Bun'),
      ],
      nice_to_have: [
        skillVerdict('Redis', 'BASIC', 'NOT_MET', null),
        skillVerdict('Teamwork', 'BASIC', 'PARTIAL', 'Làm việc nhóm'),
      ],
    };
    expect(zoneCoverage(requirements, verdicts, INDEX)).toEqual([
      { zone: 'FOUNDATION', demandWeightX100: 200, coverageX100: 10_000 },
      { zone: 'BACKEND', demandWeightX100: 300, coverageX100: 5_000 },
      { zone: 'DATABASE', demandWeightX100: 200, coverageX100: 5_000 },
      { zone: 'DEVOPS_CLOUD', demandWeightX100: 100, coverageX100: 0 },
      { zone: 'SOFT_SKILL', demandWeightX100: 150, coverageX100: 5_000 },
    ]);
  });

  it('GĐ3 coverage is weighted, rounded half-up once; a JD skill without a verdict counts NOT_MET', () => {
    const requirements = { must_have: [req('MySQL', 1), req('PostgreSQL', 2)], nice_to_have: [req('Redis', 3)] };
    // (1 × 1 + 2 × 0.5 + 3 × 0) / 6 = 33.33…%
    const verdicts = {
      must_have: [
        skillVerdict('MySQL', 'BASIC', 'MET', 'MySQL'),
        skillVerdict('PostgreSQL', 'BASIC', 'PARTIAL', 'Postgres'),
      ],
      nice_to_have: [],
    };
    expect(zoneCoverage(requirements, verdicts, INDEX)).toEqual([
      { zone: 'DATABASE', demandWeightX100: 600, coverageX100: 3_333 },
    ]);
    // (1 × 0.5 + 2 × 1 + 3 × 0.5) / 6 = 66.666…%, rounded up.
    const mixed = {
      must_have: [
        skillVerdict('MySQL', 'BASIC', 'PARTIAL', 'MySQL'),
        skillVerdict('PostgreSQL', 'BASIC', 'MET', 'Postgres'),
        skillVerdict('Redis', 'BASIC', 'PARTIAL', 'Redis'),
      ],
      nice_to_have: [],
    };
    expect(zoneCoverage(requirements, mixed, INDEX)).toEqual([
      { zone: 'DATABASE', demandWeightX100: 600, coverageX100: 6_667 },
    ]);
  });

  it('GĐ3 a JD with no catalogue skill in any zone has no coverage', () => {
    const requirements = { must_have: [req('Bun', 1), req('Agile', 1)], nice_to_have: [] };
    expect(zoneCoverage(requirements, { must_have: [], nice_to_have: [] }, INDEX)).toEqual([]);
  });
});
