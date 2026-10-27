// Match keys of the skill catalogue (FR-13, US-2.5, CONTEXT D39). The AI Service maps a name to the
// skill whose name or alias has the same `skillMatchKey`, so each key may belong to one skill only.
import { type SkillGroup, skillMatchKey, type SkillStatus } from '@srm/shared';

/** A skill as the key checks read it. */
export interface KeyedSkill {
  id: number;
  canonicalName: string;
  nameKey: string;
  aliases: readonly string[];
  status: SkillStatus;
}

export interface KeyedName {
  name: string;
  key: string;
}

/**
 * New skill names of one CV or JD result (AC-5), each once by key, the first spelling kept. A name
 * with no letter or digit has no key and is left out.
 */
export function distinctNewSkills(names: readonly string[]): KeyedName[] {
  const byKey = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim();
    const key = skillMatchKey(name);
    if (key !== '' && !byKey.has(key)) byKey.set(key, name);
  }
  return [...byKey].map(([key, name]) => ({ name, key }));
}

/**
 * The skill outside `selfIds` that already matches `key`: an approved skill by name or alias
 * first, then any reviewed or pending skill by name (its row keeps the key from coming back).
 */
export function keyOwner(key: string, skills: readonly KeyedSkill[], selfIds: readonly number[]): KeyedSkill | undefined {
  const others = skills.filter((skill) => !selfIds.includes(skill.id));
  return (
    others.find(
      (skill) =>
        skill.status === 'APPROVED' &&
        (skill.nameKey === key || skill.aliases.some((alias) => skillMatchKey(alias) === key)),
    ) ?? others.find((skill) => skill.nameKey === key)
  );
}

/** `aliases` plus `names`, each once by key, never a spelling of `canonicalName` itself. */
export function withAliases(canonicalName: string, aliases: readonly string[], names: readonly string[]): string[] {
  const seen = new Set([skillMatchKey(canonicalName)]);
  const kept: string[] = [];
  for (const name of [...aliases, ...names]) {
    const key = skillMatchKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(name);
  }
  return kept;
}

/** What approving a pending skill writes (AC-7). */
export interface Approval {
  canonicalName: string;
  nameKey: string;
  aliases: string[];
  group: SkillGroup;
  /** Every spelling the approved skill will match, to check against the other skills. */
  names: KeyedName[];
}

/**
 * Approves `pending` under `canonicalName`. Renamed to another key, the name the CV or JD wrote
 * stays as an alias, so it keeps matching (AC-10).
 */
export function approvalOf(
  pending: Pick<KeyedSkill, 'canonicalName' | 'nameKey' | 'aliases'>,
  canonicalName: string,
  group: SkillGroup,
): Approval {
  const nameKey = skillMatchKey(canonicalName);
  const renamed = nameKey !== pending.nameKey ? [pending.canonicalName] : [];
  const aliases = withAliases(canonicalName, pending.aliases, renamed);
  return {
    canonicalName,
    nameKey,
    aliases,
    group,
    names: [canonicalName, ...aliases].map((name) => ({ name, key: skillMatchKey(name) })),
  };
}

/** What merging a pending skill into an approved one adds to the target (AC-7). */
export interface Merge {
  aliases: string[];
  /** The spellings the target gains, to check against the other skills. */
  added: KeyedName[];
}

export function mergeOf(source: Pick<KeyedSkill, 'canonicalName' | 'aliases'>, target: KeyedSkill): Merge {
  const aliases = withAliases(target.canonicalName, target.aliases, [source.canonicalName, ...source.aliases]);
  const known = new Set([target.canonicalName, ...target.aliases].map(skillMatchKey));
  const added = aliases
    .map((name) => ({ name, key: skillMatchKey(name) }))
    .filter(({ key }) => !known.has(key));
  return { aliases, added };
}
