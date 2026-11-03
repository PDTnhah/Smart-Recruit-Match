import {
  type JdRequirements,
  type JdSkillRequirement,
  type MatchCriteria,
  type MatchKind,
  type MatchSkillSource,
  type MatchSkillVerdict,
  type MatchVerdict,
  MAX_VERDICT_SOURCES,
  type SkillLevel,
  type SkillTaxonomyEntry,
  skillMatchKey,
} from '@srm/shared';
import { type EvidenceTier, FAMILY_MIN_TIER, FAMILY_RULE_EXCLUDED, LEVEL_TIER, MAX_EVIDENCE_CHARS } from './matching-rules.js';
import {
  type CvSkillEvidence,
  evidenceOfNewSkill,
  evidenceOfSkill,
  namesSkill,
  type SkillEvidence,
  type SkillMention,
} from './skill-evidence.js';
import type { TaxonomyIndex } from './taxonomy-index.js';

// Verdicts on the skills of a JD, by code (FR-40, US-3.5 AC-5–AC-7, PRD › Luật khớp kỹ năng,
// CONTEXT D42, D44). In order: the skill itself or a skill that implies it, judged by its tier
// against the level the JD asks; else a skill of the same family at T2 or more, PARTIAL; else
// NOT_MET. The evidence quotes the CV entries the verdict rests on (Invariant 5).

export type SkillRequirements = Pick<JdRequirements, 'must_have' | 'nice_to_have'>;

export type SkillVerdicts = Pick<MatchCriteria, 'must_have' | 'nice_to_have'>;

/** What a quoted entry is called in the evidence (PRD › S_cv sample). */
const ENTRY_LABEL = { PROJECT: 'Dự án', EXPERIENCE: 'Kinh nghiệm', CERTIFICATE: 'Chứng chỉ' } as const;

/**
 * As many of `items` as fit in `max` characters, joined by `separator`, so a quote is cut between
 * items; the first item alone is cut only if it does not fit.
 */
function joinWithin(items: readonly string[], separator: string, max: number): string {
  let joined = '';
  for (const item of items) {
    const next = joined === '' ? item : `${joined}${separator}${item}`;
    if (next.length > max) break;
    joined = next;
  }
  return joined === '' ? (items[0] ?? '').slice(0, max) : joined;
}

/**
 * The sources of a verdict, the strongest first, and its evidence (AC-6): each entry as the CV calls
 * it with the words that name the skill, "Dự án 'Quản lý thư viện' – Java, Spring Boot"; a skill
 * of the skills list as written.
 */
function quote(
  mentions: readonly SkillMention[],
  titles: CvSkillEvidence['entryTitles'],
): { sources: MatchSkillSource[]; evidence: string } {
  const shown = mentions.slice(0, MAX_VERDICT_SOURCES);
  const sources = shown.map(({ section, index, phrases }) => ({
    section,
    index,
    text: joinWithin(phrases, ', ', MAX_EVIDENCE_CHARS),
  }));
  const parts = shown.map(({ section, index, phrases }) => {
    if (section === 'SKILLS_LIST') return joinWithin(phrases, ', ', MAX_EVIDENCE_CHARS);
    const title = `${ENTRY_LABEL[section]} '${titles[section][index] ?? ''}'`;
    // A certificate is named by its title, which holds the words.
    if (section === 'CERTIFICATE') return title;
    const head = `${title} – `;
    return head + joinWithin(phrases, ', ', MAX_EVIDENCE_CHARS - head.length);
  });
  return { sources, evidence: joinWithin(parts, '; ', MAX_EVIDENCE_CHARS) };
}

/** MET from the tier the level needs, PARTIAL from T1 (AC-5). */
const verdictOf = (tier: EvidenceTier, level: SkillLevel): MatchVerdict =>
  tier >= LEVEL_TIER[level] ? 'MET' : tier >= 1 ? 'PARTIAL' : 'NOT_MET';

interface Candidate {
  skill: SkillTaxonomyEntry;
  evidence: SkillEvidence;
}

/** The skill of `ids` (ascending) with the highest tier from `minTier`, the smallest id on a tie. */
function strongest(
  ids: readonly number[],
  evidence: CvSkillEvidence,
  taxonomy: TaxonomyIndex,
  minTier: EvidenceTier,
): Candidate | null {
  let best: Candidate | null = null;
  for (const id of ids) {
    const found = evidenceOfSkill(evidence, taxonomy, id);
    const skill = taxonomy.byId.get(id);
    if (skill !== undefined && found.tier >= minTier && (best === null || found.tier > best.evidence.tier)) {
      best = { skill, evidence: found };
    }
  }
  return best;
}

function verdictOn(requirement: JdSkillRequirement, evidence: CvSkillEvidence, taxonomy: TaxonomyIndex): MatchSkillVerdict {
  const judged = (
    verdict: MatchVerdict,
    match_kind: MatchKind,
    tier: EvidenceTier,
    via: string | null,
    mentions: readonly SkillMention[],
  ): MatchSkillVerdict => ({
    skill: requirement.skill,
    level_required: requirement.level,
    verdict,
    match_kind,
    tier,
    via,
    ...quote(mentions, evidence.entryTitles),
  });

  // A JD skill outside the catalogue matches by its key only: no implication, no family (D44).
  const key = skillMatchKey(requirement.skill);
  const skill = taxonomy.byKey.get(key);
  const found = skill === undefined ? evidenceOfNewSkill(evidence, key) : evidenceOfSkill(evidence, taxonomy, skill.skillId);
  const verdict = verdictOf(found.tier, requirement.level);
  if (found.own) return judged(verdict, 'EXACT', found.tier, null, found.mentions);
  if (skill !== undefined && found.mentions.length > 0) {
    // The CV names some skill that implies this one; `via` is one it names, not a skill between
    // (NestJS ⇒ TypeScript ⇒ JavaScript goes via NestJS).
    const named = (taxonomy.impliersOf.get(skill.skillId) ?? []).filter((id) => namesSkill(evidence, taxonomy, id));
    const via = strongest(named, evidence, taxonomy, 1);
    return judged(verdict, 'IMPLIED', found.tier, via?.skill.canonicalName ?? null, found.mentions);
  }

  if (skill !== undefined && skill.family !== null && !FAMILY_RULE_EXCLUDED.has(skill.family)) {
    const members = (taxonomy.familyMembers.get(skill.family) ?? []).filter((id) => id !== skill.skillId);
    const standIn = strongest(members, evidence, taxonomy, FAMILY_MIN_TIER);
    if (standIn !== null) {
      const { tier, mentions } = standIn.evidence;
      return judged('PARTIAL', 'FAMILY', tier, standIn.skill.canonicalName, mentions);
    }
  }

  return {
    skill: requirement.skill,
    level_required: requirement.level,
    verdict: 'NOT_MET',
    evidence: null,
    match_kind: 'NONE',
    tier: 0,
    via: null,
    sources: [],
  };
}

/**
 * The verdict on every skill of a JD for one CV (AC-5), in the order of the requirements. Build
 * `evidence` once per CV and `taxonomy` once per run (US-3.2).
 */
export function matchSkills(requirements: SkillRequirements, evidence: CvSkillEvidence, taxonomy: TaxonomyIndex): SkillVerdicts {
  const judge = (requirement: JdSkillRequirement) => verdictOn(requirement, evidence, taxonomy);
  return { must_have: requirements.must_have.map(judge), nice_to_have: requirements.nice_to_have.map(judge) };
}
