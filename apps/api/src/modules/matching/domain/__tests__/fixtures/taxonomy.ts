import { type SkillFamily, type SkillGroup, type SkillTaxonomyEntry, skillMatchKey, zoneOf } from '@srm/shared';
import { indexTaxonomy } from '../../taxonomy-index.js';

/** `impliedSkillIds` is given as the closure, as `SkillCatalogService.taxonomy()` returns it. */
function skill(
  skillId: number,
  canonicalName: string,
  group: SkillGroup,
  family: SkillFamily | null,
  aliases: string[] = [],
  impliedSkillIds: number[] = [],
): SkillTaxonomyEntry {
  return {
    skillId,
    canonicalName,
    nameKey: skillMatchKey(canonicalName),
    aliasKeys: aliases.map(skillMatchKey),
    group,
    family,
    zone: zoneOf(family),
    impliedSkillIds,
  };
}

/** A small catalogue with the traps of free text: short keys, everyday words, soft skills. */
export const TAXONOMY: readonly SkillTaxonomyEntry[] = [
  skill(1, 'Java', 'LANGUAGE', 'MANAGED_LANGUAGE'),
  skill(2, 'Spring Boot', 'FRAMEWORK', 'BACKEND_FRAMEWORK', [], [1, 3]),
  skill(3, 'Spring Framework', 'FRAMEWORK', 'BACKEND_FRAMEWORK', ['Spring'], [1]),
  skill(4, 'SQL', 'LANGUAGE', 'SQL'),
  skill(5, 'MySQL', 'DATABASE', 'RELATIONAL_DB', [], [4]),
  skill(6, 'PostgreSQL', 'DATABASE', 'RELATIONAL_DB', ['Postgres'], [4]),
  skill(7, 'Docker', 'CLOUD_DEVOPS', 'CONTAINERIZATION'),
  skill(8, 'Podman', 'CLOUD_DEVOPS', 'CONTAINERIZATION'),
  skill(9, 'Go', 'LANGUAGE', 'SYSTEMS_LANGUAGE', ['Golang']),
  skill(10, 'React', 'FRAMEWORK', 'SPA_FRAMEWORK', ['ReactJS']),
  skill(11, 'React Native', 'FRAMEWORK', 'CROSS_PLATFORM_MOBILE'),
  skill(12, 'Node.js', 'FRAMEWORK', 'BACKEND_FRAMEWORK', ['NodeJS']),
  skill(13, 'C++', 'LANGUAGE', 'SYSTEMS_LANGUAGE'),
  skill(14, 'C#', 'LANGUAGE', 'MANAGED_LANGUAGE'),
  skill(15, 'Kotlin', 'LANGUAGE', 'MANAGED_LANGUAGE'),
  skill(16, 'English', 'OTHER', 'FOREIGN_LANGUAGE', ['Tiếng Anh']),
  skill(17, 'Japanese', 'OTHER', 'FOREIGN_LANGUAGE', ['Tiếng Nhật']),
  skill(18, 'Teamwork', 'SOFT_SKILL', 'TEAMWORK', ['Làm việc nhóm']),
  skill(19, 'Microsoft Excel', 'TOOL', 'DATA_ANALYTICS', ['Excel']),
  skill(20, 'AWS', 'CLOUD_DEVOPS', 'CLOUD_PROVIDER', ['Amazon Web Services']),
  skill(21, 'Git', 'TOOL', 'VERSION_CONTROL'),
  skill(22, 'Hibernate', 'FRAMEWORK', 'ORM', [], [1]),
  skill(23, 'Redis', 'DATABASE', 'NOSQL_DB'),
  skill(24, 'R', 'LANGUAGE', 'NUMERIC_LANGUAGE'),
  skill(25, 'Agile', 'METHODOLOGY', null),
  skill(26, 'JavaScript', 'LANGUAGE', 'JS_TS', ['JS']),
  skill(27, 'Leadership', 'SOFT_SKILL', 'LEADERSHIP', ['Lãnh đạo']),
  skill(28, 'People Management', 'SOFT_SKILL', 'LEADERSHIP'),
  skill(29, 'TypeScript', 'LANGUAGE', 'JS_TS', ['TS'], [26]),
  skill(30, 'NestJS', 'FRAMEWORK', 'BACKEND_FRAMEWORK', [], [26, 29]),
  skill(31, 'Data Structures and Algorithms', 'METHODOLOGY', null, ['Cấu trúc dữ liệu và giải thuật']),
  skill(32, 'Statistics', 'DATA_AI', null, ['Thống kê']),
  skill(33, 'Oracle Database', 'DATABASE', 'RELATIONAL_DB', ['Oracle']),
];

export const INDEX = indexTaxonomy(TAXONOMY);

/** The id of a catalogue skill by its canonical name. */
export function idOf(name: string): number {
  const entry = TAXONOMY.find((skill) => skill.canonicalName === name);
  if (entry === undefined) throw new Error(`no skill ${name} in the test taxonomy`);
  return entry.skillId;
}
