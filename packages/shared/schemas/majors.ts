import type { PositionGroup } from '../contracts/jd.js';
import { normalizeAudienceValue } from '../contracts/text.js';

// Major groups and how close each is to a position group (PRD › Mức khớp ngành, FR-40, US-3.6,
// CONTEXT D42, D45). Code reads the major match of a JD that names no major from this table; the
// LLM never judges it (AGENTS › Invariant 2).

export const MAJOR_GROUPS = ['SOFTWARE', 'INFO_SYS', 'NET_SEC', 'DATA_AI', 'MATH', 'ELEC', 'BUSINESS'] as const;

export type MajorGroup = (typeof MAJOR_GROUPS)[number];

/**
 * Names of the majors of each group: Vietnamese, abbreviations and English, compared by `majorKey`.
 * A name belongs to one group only.
 */
export const MAJOR_ALIASES: Readonly<Record<MajorGroup, readonly string[]>> = {
  SOFTWARE: [
    'công nghệ thông tin',
    'cntt',
    'information technology',
    'it',
    'khoa học máy tính',
    'khmt',
    'computer science',
    'cs',
    'kỹ thuật phần mềm',
    'ktpm',
    'software engineering',
    'công nghệ phần mềm',
    'cnpm',
    'kỹ thuật máy tính',
    'ktmt',
    'computer engineering',
  ],
  INFO_SYS: [
    'hệ thống thông tin',
    'httt',
    'information systems',
    'hệ thống thông tin quản lý',
    'htttql',
    'management information systems',
    'mis',
    'thương mại điện tử',
    'tmđt',
    'e commerce',
    'electronic commerce',
  ],
  NET_SEC: [
    'mạng máy tính và truyền thông dữ liệu',
    'mạng máy tính và truyền thông',
    'truyền thông và mạng máy tính',
    'mạng máy tính',
    'mmt',
    'computer networks',
    'an toàn thông tin',
    'attt',
    'information security',
    'an ninh mạng',
    'cyber security',
    'cybersecurity',
  ],
  DATA_AI: [
    'khoa học dữ liệu',
    'khdl',
    'data science',
    'trí tuệ nhân tạo',
    'ttnt',
    'artificial intelligence',
    'ai',
    'khoa học dữ liệu và trí tuệ nhân tạo',
  ],
  MATH: [
    'toán tin',
    'toán tin ứng dụng',
    'mathematics and computer science',
    'toán ứng dụng',
    'applied mathematics',
    'toán học',
    'mathematics',
    'thống kê',
    'statistics',
  ],
  ELEC: [
    'điện tử viễn thông',
    'kỹ thuật điện tử viễn thông',
    'công nghệ kỹ thuật điện tử viễn thông',
    'đtvt',
    'electronics and telecommunications',
    'điều khiển và tự động hóa',
    'kỹ thuật điều khiển và tự động hóa',
    'tự động hóa',
    'control and automation engineering',
  ],
  BUSINESS: [
    'quản trị kinh doanh',
    'qtkd',
    'business administration',
    'kinh tế',
    'economics',
    'kế toán',
    'accounting',
    'tài chính ngân hàng',
    'tcnh',
    'finance and banking',
    'marketing',
  ],
};

/** How close each major group is to a position group; a group in neither list is OTHER (CONTEXT D45). */
export interface PositionMajorFit {
  exact: readonly MajorGroup[];
  related: readonly MajorGroup[];
}

const SOFTWARE_POSITION: PositionMajorFit = {
  exact: ['SOFTWARE'],
  related: ['INFO_SYS', 'NET_SEC', 'DATA_AI', 'MATH', 'ELEC'],
};

export const POSITION_MAJOR_FIT: Readonly<Record<PositionGroup, PositionMajorFit>> = {
  BACKEND: SOFTWARE_POSITION,
  FRONTEND: SOFTWARE_POSITION,
  MOBILE: SOFTWARE_POSITION,
  DATA_AI: { exact: ['DATA_AI', 'SOFTWARE'], related: ['MATH', 'INFO_SYS'] },
  TESTER_QA: { exact: ['SOFTWARE', 'INFO_SYS'], related: ['NET_SEC', 'DATA_AI', 'MATH', 'ELEC'] },
  BA: { exact: ['INFO_SYS'], related: ['SOFTWARE', 'BUSINESS'] },
  DEVOPS: { exact: ['SOFTWARE', 'NET_SEC'], related: ['INFO_SYS', 'ELEC'] },
  OTHER: { exact: [], related: ['SOFTWARE', 'INFO_SYS', 'NET_SEC', 'DATA_AI', 'MATH', 'ELEC'] },
};

/** Old and new spellings of the same word ("kĩ thuật", "tự động hoá"). */
const SPELLINGS: ReadonlyMap<string, string> = new Map([
  ['kĩ', 'kỹ'],
  ['lí', 'lý'],
  ['hoá', 'hóa'],
]);

/** Words before the name that are not part of it ("Ngành Công nghệ thông tin"). */
const LEADING_WORDS = ['chuyên ngành ', 'ngành '];

/**
 * Key a major name is compared by: `normalizeAudienceValue`, punctuation as spaces, "&" as "và",
 * one spelling per word, without a leading "ngành".
 */
export function majorKey(major: string): string {
  const words = normalizeAudienceValue(major.replace(/&/g, ' và ').replace(/[-–—,.;:/()]/g, ' '))
    .split(' ')
    .map((word) => SPELLINGS.get(word) ?? word);
  const key = words.join(' ');
  const leading = LEADING_WORDS.find((word) => key.startsWith(word));
  return leading ? key.slice(leading.length) : key;
}

const GROUP_BY_KEY: ReadonlyMap<string, MajorGroup> = new Map(
  MAJOR_GROUPS.flatMap((group) => MAJOR_ALIASES[group].map((alias) => [majorKey(alias), group] as const)),
);

/** The group of a major name, or null when no group lists it (or there is no major). */
export function majorGroupOf(major: string | null): MajorGroup | null {
  if (major === null) return null;
  return GROUP_BY_KEY.get(majorKey(major)) ?? null;
}
