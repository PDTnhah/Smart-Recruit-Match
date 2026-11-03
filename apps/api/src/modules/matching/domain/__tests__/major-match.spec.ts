import {
  MAJOR_ALIASES,
  MAJOR_GROUPS,
  MatchEducationSchema,
  POSITION_GROUPS,
  POSITION_MAJOR_FIT,
  type PositionGroup,
} from '@srm/shared';
import { majorMatch } from '../major-match.js';

const anyMajor = (positionGroup: PositionGroup) => ({ majors: [], positionGroup });

describe('GĐ3 FR-40 major match by JD majors, position group table, unrecognized flag (US-3.6 AC-6, AC-7)', () => {
  it('AC-6 a JD that names majors: a pair past the hard filter is EXACT', () => {
    const jd = { majors: ['Công nghệ thông tin'], positionGroup: 'BA' as const };
    expect(majorMatch(jd, 'Công nghệ thông tin')).toEqual({ major_match: 'EXACT', major_unrecognized: false });
  });

  it('AC-6 the PRD examples: Kỹ thuật phần mềm is EXACT for Backend, Toán tin RELATED for Data/AI', () => {
    expect(majorMatch(anyMajor('BACKEND'), 'Kỹ thuật phần mềm')).toEqual({ major_match: 'EXACT', major_unrecognized: false });
    expect(majorMatch(anyMajor('DATA_AI'), 'Toán tin')).toEqual({ major_match: 'RELATED', major_unrecognized: false });
  });

  it.each<[PositionGroup, string, string]>([
    ['BA', 'Kế toán', 'RELATED'],
    ['BA', 'Hệ thống thông tin quản lý', 'EXACT'],
    ['BACKEND', 'Kế toán', 'OTHER'],
    ['DEVOPS', 'An toàn thông tin', 'EXACT'],
    ['TESTER_QA', 'Điện tử viễn thông', 'RELATED'],
    ['OTHER', 'Công nghệ thông tin', 'RELATED'],
    ['OTHER', 'Quản trị kinh doanh', 'OTHER'],
  ])('AC-6 %s with %s is %s', (position, major, match) => {
    expect(majorMatch(anyMajor(position), major)).toEqual({ major_match: match, major_unrecognized: false });
  });

  it('AC-6 an unrecognised major, or none, is OTHER and flagged', () => {
    expect(majorMatch(anyMajor('BACKEND'), 'Ngôn ngữ Anh')).toEqual({ major_match: 'OTHER', major_unrecognized: true });
    expect(majorMatch(anyMajor('BACKEND'), null)).toEqual({ major_match: 'OTHER', major_unrecognized: true });
  });

  it('AC-7 every position and major group gives the row of the table, in the contract shape', () => {
    for (const position of POSITION_GROUPS) {
      const fit = POSITION_MAJOR_FIT[position];
      for (const group of MAJOR_GROUPS) {
        const result = majorMatch(anyMajor(position), MAJOR_ALIASES[group][0]!);
        const expected = fit.exact.includes(group) ? 'EXACT' : fit.related.includes(group) ? 'RELATED' : 'OTHER';
        expect([position, group, MatchEducationSchema.parse(result).major_match]).toEqual([position, group, expected]);
      }
    }
  });
});
