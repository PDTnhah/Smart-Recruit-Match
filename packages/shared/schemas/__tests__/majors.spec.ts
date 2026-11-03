import {
  MAJOR_ALIASES,
  MAJOR_GROUPS,
  majorGroupOf,
  majorKey,
  POSITION_GROUPS,
  POSITION_MAJOR_FIT,
} from '../../index.js';

describe('GĐ3 FR-40 major groups and position fit (US-3.6 AC-6, CONTEXT D45)', () => {
  it('AC-6 every alias reads as its own group, and no alias is in two groups', () => {
    const seen = new Map<string, string>();
    for (const group of MAJOR_GROUPS) {
      for (const alias of MAJOR_ALIASES[group]) {
        expect([alias, majorGroupOf(alias)]).toEqual([alias, group]);
        expect([alias, seen.get(majorKey(alias))]).toEqual([alias, undefined]);
        seen.set(majorKey(alias), group);
      }
    }
  });

  it('AC-6 every position group has a row; a major group is never both exact and related', () => {
    for (const position of POSITION_GROUPS) {
      const { exact, related } = POSITION_MAJOR_FIT[position];
      expect([position, exact.filter((group) => related.includes(group))]).toEqual([position, []]);
      expect(new Set([...exact, ...related]).size).toBe(exact.length + related.length);
    }
  });

  it.each([
    ['Công nghệ thông tin', 'SOFTWARE'],
    [' CNTT ', 'SOFTWARE'],
    ['Ngành Kỹ thuật phần mềm', 'SOFTWARE'],
    ['Kĩ thuật phần mềm', 'SOFTWARE'],
    ['Computer Science', 'SOFTWARE'],
    ['Hệ thống thông tin quản lí', 'INFO_SYS'],
    ['E-commerce', 'INFO_SYS'],
    ['An toàn thông tin', 'NET_SEC'],
    ['Khoa học dữ liệu', 'DATA_AI'],
    ['Toán - Tin', 'MATH'],
    ['Điều khiển & Tự động hoá', 'ELEC'],
    ['Tài chính - Ngân hàng', 'BUSINESS'],
  ])('AC-6 reads %s as %s, ignoring case, spacing, punctuation and spelling', (major, group) => {
    expect(majorGroupOf(major)).toBe(group);
    expect(majorGroupOf(major.normalize('NFD'))).toBe(group);
  });

  it('AC-6 an unknown major or no major is in no group', () => {
    expect(majorGroupOf('Ngôn ngữ Anh')).toBeNull();
    expect(majorGroupOf('Công nghệ thông tin chất lượng cao')).toBeNull();
    expect(majorGroupOf('')).toBeNull();
    expect(majorGroupOf(null)).toBeNull();
  });
});
