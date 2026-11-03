import {
  type CvProfileMasked,
  type EvidenceSection,
  type SkillFamily,
  type SkillTaxonomyEntry,
  skillMatchKey,
} from '@srm/shared';
import {
  COMMON_WORD_KEYS,
  type EvidenceTier,
  MAX_NGRAM_WORDS,
  MIN_FREE_TEXT_KEY_LENGTH,
  SECTION_ORDER,
  SOFT_SKILL_TIER_RULES,
  TIER_RULES,
} from './matching-rules.js';
import { entryInterval, type MonthInterval, refMonthOf, unionMonths } from './period.js';
import { softSkillSignals } from './soft-skill-signals.js';
import type { TaxonomyIndex } from './taxonomy-index.js';

// Where a CV shows each skill, and how strongly (FR-40, US-3.5 AC-2–AC-4, CONTEXT D44). Code reads
// only the masked profile (BR-03) and copies every phrase from it, so the evidence of a verdict is
// always text the CV holds (Invariant 5). One CV entry is one source, however often it names the
// skill.

/** One CV entry that names a skill, with the words that name it as the CV writes them. */
export interface SkillMention {
  section: EvidenceSection;
  /** Position of the entry in its CV list. */
  index: number;
  /** Distinct, in the order found. */
  phrases: string[];
}

export interface CvSkillEvidence {
  /** Mentions of each catalogue skill, one per CV entry. */
  bySkillId: ReadonlyMap<number, readonly SkillMention[]>;
  /** Mentions of names outside the catalogue by key: skills-list names and whole technologies. */
  byNewKey: ReadonlyMap<string, readonly SkillMention[]>;
  /** Signals of each soft-skill competency, one mention per CV entry (AC-8). */
  bySoftSkillFamily: ReadonlyMap<SkillFamily, readonly SkillMention[]>;
  /** What the evidence text calls each entry: the project, the organisation, the certificate. */
  entryTitles: Readonly<Record<Exclude<EvidenceSection, 'SKILLS_LIST'>, readonly string[]>>;
  /** Months of each experience entry; null when a date is missing or unreadable. */
  experienceIntervals: readonly (MonthInterval | null)[];
}

/** Mentions of one name, by entry. */
type EntryMentions = Map<string, SkillMention>;

function mention<K>(into: Map<K, EntryMentions>, name: K, section: EvidenceSection, index: number, phrase: string): void {
  let entries = into.get(name);
  if (entries === undefined) {
    entries = new Map<string, SkillMention>();
    into.set(name, entries);
  }
  const entry = `${section}:${index}`;
  const found = entries.get(entry);
  if (found === undefined) entries.set(entry, { section, index, phrases: [phrase] });
  else if (!found.phrases.includes(phrase)) found.phrases.push(phrase);
}

/**
 * Words of free text: runs of letters, digits, `+` and `#` ("C++", "C#"). Every other character
 * splits, so "Java/Spring", "Node.js" and "front-end" give their parts; an n-gram joins them again,
 * since the key drops the separators.
 */
const WORD = /[\p{L}\p{M}\p{N}+#]+/gu;

/** A gap between words that ends a sentence or a line: no n-gram spans it ("Java. Script"). */
const BREAK = /[\n\r\p{Zl}\p{Zp}]|[.!?…]\s/u;

/**
 * Whether `key` of `skill` may match where it was found. Soft skills never match outside the skills
 * list: "làm việc nhóm" in a description is no evidence (signals are, AC-8). In free text, keys that
 * are short or everyday words do not match either (AC-3).
 */
function matchable(skill: SkillTaxonomyEntry, key: string, freeText: boolean): boolean {
  if (skill.group === 'SOFT_SKILL') return false;
  return !freeText || ([...key].length >= MIN_FREE_TEXT_KEY_LENGTH && !COMMON_WORD_KEYS.has(key));
}

interface Found {
  skill: SkillTaxonomyEntry;
  phrase: string;
}

/**
 * Catalogue skills `text` names: n-grams of 1 to MAX_NGRAM_WORDS words, leftmost and longest first,
 * none overlapping, so "React Native" does not name React too. An n-gram is the text between its
 * first and last word, so one across a comma or a bracket never matches; nor does one across the
 * end of a sentence or a line.
 */
function scan(text: string, taxonomy: TaxonomyIndex, freeText: boolean): Found[] {
  const words = [...text.matchAll(WORD)].map((match) => ({ start: match.index, end: match.index + match[0].length }));
  const found: Found[] = [];
  let i = 0;
  while (i < words.length) {
    let span = 1;
    while (
      span < MAX_NGRAM_WORDS &&
      i + span < words.length &&
      !BREAK.test(text.slice(words[i + span - 1]!.end, words[i + span]!.start))
    ) {
      span += 1;
    }
    let width = 1;
    for (let n = span; n >= 1; n -= 1) {
      const phrase = text.slice(words[i]!.start, words[i + n - 1]!.end);
      const key = skillMatchKey(phrase);
      const skill = taxonomy.byKey.get(key);
      if (skill !== undefined && matchable(skill, key, freeText)) {
        found.push({ skill, phrase });
        width = n;
        break;
      }
    }
    i += width;
  }
  return found;
}

const values = <K>(map: Map<K, EntryMentions>): Map<K, SkillMention[]> =>
  new Map([...map].map(([name, entries]) => [name, [...entries.values()]]));

/**
 * The mentions of every skill in a CV (AC-2): the skills list by catalogue name (a name outside the
 * catalogue by its key); the technologies of a project, each as a whole and, failing that, by
 * n-grams; then the free text of projects, experience and certificates by n-grams (AC-3). Only the
 * dates of experience entries are read (AC-1); `refDate` is `intake_end` of the campaign.
 */
export function buildSkillEvidence(profile: CvProfileMasked, taxonomy: TaxonomyIndex, refDate: Date): CvSkillEvidence {
  const bySkillId = new Map<number, EntryMentions>();
  const byNewKey = new Map<string, EntryMentions>();
  const scanInto = (section: EvidenceSection, index: number, text: string | null, freeText: boolean) => {
    if (text === null) return;
    for (const { skill, phrase } of scan(text, taxonomy, freeText)) mention(bySkillId, skill.skillId, section, index, phrase);
  };

  profile.skills.forEach((skill, index) => {
    const nameKey = skillMatchKey(skill.name);
    const catalogued =
      (skill.canonical_name === null ? undefined : taxonomy.byKey.get(skillMatchKey(skill.canonical_name))) ??
      taxonomy.byKey.get(nameKey);
    if (catalogued !== undefined) mention(bySkillId, catalogued.skillId, 'SKILLS_LIST', index, skill.name);
    // A name the catalogue does not know stays by its key, though the CV parser mapped it to a
    // catalogue skill ("Spring MVC" → Spring Framework), so a JD skill of that name finds it.
    if (nameKey !== '' && !taxonomy.byKey.has(nameKey)) mention(byNewKey, nameKey, 'SKILLS_LIST', index, skill.name);
  });

  profile.projects.forEach((project, index) => {
    for (const technology of project.technologies) {
      const key = skillMatchKey(technology);
      const skill = taxonomy.byKey.get(key);
      if (skill === undefined) {
        if (key !== '') mention(byNewKey, key, 'PROJECT', index, technology);
        scanInto('PROJECT', index, technology, false);
      } else if (matchable(skill, key, false)) {
        mention(bySkillId, skill.skillId, 'PROJECT', index, technology);
      }
    }
    for (const text of [project.name, project.role, project.description]) scanInto('PROJECT', index, text, true);
  });

  profile.experience.forEach((entry, index) => {
    for (const text of [entry.position, entry.description]) scanInto('EXPERIENCE', index, text, true);
  });

  profile.certificates.forEach((certificate, index) => scanInto('CERTIFICATE', index, certificate.name, true));

  const bySoftSkillFamily = new Map<SkillFamily, EntryMentions>();
  for (const { family, section, index, phrase } of softSkillSignals(profile)) {
    mention(bySoftSkillFamily, family, section, index, phrase);
  }

  const refMonth = refMonthOf(refDate);
  return {
    bySkillId: values(bySkillId),
    byNewKey: values(byNewKey),
    bySoftSkillFamily: values(bySoftSkillFamily),
    entryTitles: {
      PROJECT: profile.projects.map((project) => project.name),
      EXPERIENCE: profile.experience.map((entry) => entry.organization),
      CERTIFICATE: profile.certificates.map((certificate) => certificate.name),
    },
    experienceIntervals: profile.experience.map((entry) => entryInterval(entry.start, entry.end, refMonth)),
  };
}

/**
 * The tier of a set of mentions, one per CV entry (AC-4, `matching-rules/v1`): T4 when the
 * experience entries among them cover TIER_RULES.t4MinExperienceMonths together; T3 with
 * t3MinProjectOrExperienceSources project or experience entries; T2 with one project, experience or
 * certificate; T1 when only the skills list names the skill.
 */
export function tierOf(mentions: readonly SkillMention[], experienceIntervals: readonly (MonthInterval | null)[]): EvidenceTier {
  let projectsAndExperience = 0;
  let certificates = 0;
  let listed = false;
  const months: (MonthInterval | null)[] = [];
  for (const { section, index } of mentions) {
    if (section === 'SKILLS_LIST') listed = true;
    else if (section === 'CERTIFICATE') certificates += 1;
    else {
      projectsAndExperience += 1;
      if (section === 'EXPERIENCE') months.push(experienceIntervals[index] ?? null);
    }
  }
  if (unionMonths(months) >= TIER_RULES.t4MinExperienceMonths) return 4;
  if (projectsAndExperience >= TIER_RULES.t3MinProjectOrExperienceSources) return 3;
  if (projectsAndExperience + certificates > 0) return 2;
  return listed ? 1 : 0;
}

/**
 * The tier of a soft skill (AC-8): T2, T3, T4 from signals in 1, 2 and 3 distinct CV entries; T1
 * when only the skills list names it.
 */
export function softSkillTierOf(mentions: readonly SkillMention[]): EvidenceTier {
  const entries = mentions.filter((mention) => mention.section !== 'SKILLS_LIST').length;
  if (entries >= SOFT_SKILL_TIER_RULES.t4MinSignalEntries) return 4;
  if (entries >= SOFT_SKILL_TIER_RULES.t3MinSignalEntries) return 3;
  if (entries >= SOFT_SKILL_TIER_RULES.t2MinSignalEntries) return 2;
  return mentions.length > 0 ? 1 : 0;
}

const sectionRank = new Map(SECTION_ORDER.map((section, rank) => [section, rank]));

/**
 * One mention per CV entry, the phrases of an entry merged in the order given; sorted by
 * SECTION_ORDER, then by position in the CV.
 */
export function mergeMentions(groups: Iterable<readonly SkillMention[]>): SkillMention[] {
  const merged = new Map<string, SkillMention>();
  for (const group of groups) {
    for (const { section, index, phrases } of group) {
      const entry = `${section}:${index}`;
      const found = merged.get(entry);
      if (found === undefined) merged.set(entry, { section, index, phrases: [...phrases] });
      else for (const phrase of phrases) if (!found.phrases.includes(phrase)) found.phrases.push(phrase);
    }
  }
  return [...merged.values()].sort(
    (a, b) => sectionRank.get(a.section)! - sectionRank.get(b.section)! || a.index - b.index,
  );
}

export interface SkillEvidence {
  /** Mentions of the skill and of every skill that implies it, merged by CV entry. */
  mentions: readonly SkillMention[];
  tier: EvidenceTier;
  /** The CV names the skill itself (EXACT), not only skills that imply it (IMPLIED). */
  own: boolean;
}

const NO_MENTIONS: readonly SkillMention[] = [];

/** Mentions of one catalogue skill: where the CV names it, and the signals of its competency. */
function ownMentions(evidence: CvSkillEvidence, taxonomy: TaxonomyIndex, skillId: number): readonly SkillMention[] {
  const named = evidence.bySkillId.get(skillId) ?? NO_MENTIONS;
  const family = taxonomy.byId.get(skillId)?.family ?? null;
  const signals = family === null ? NO_MENTIONS : (evidence.bySoftSkillFamily.get(family) ?? NO_MENTIONS);
  return signals.length === 0 ? named : mergeMentions([named, signals]);
}

/** The CV names the skill itself, or shows its competency (a soft skill). */
export const namesSkill = (evidence: CvSkillEvidence, taxonomy: TaxonomyIndex, skillId: number): boolean =>
  ownMentions(evidence, taxonomy, skillId).length > 0;

/**
 * Evidence by taxonomy, CV and skill: every JD of a run asks again for the same skills, their
 * impliers and their families (US-3.2).
 */
const evidenceCache = new WeakMap<TaxonomyIndex, WeakMap<CvSkillEvidence, Map<number, SkillEvidence>>>();

/**
 * Evidence of a catalogue skill (AC-4): its own mentions and those of every skill that implies it
 * (Spring Boot ⇒ Java), so a project in Spring Boot is a source for Java too. A soft skill also
 * takes the signals of its competency and is tiered by them (AC-8).
 */
export function evidenceOfSkill(evidence: CvSkillEvidence, taxonomy: TaxonomyIndex, skillId: number): SkillEvidence {
  let byCv = evidenceCache.get(taxonomy);
  if (byCv === undefined) {
    byCv = new WeakMap();
    evidenceCache.set(taxonomy, byCv);
  }
  let bySkill = byCv.get(evidence);
  if (bySkill === undefined) {
    bySkill = new Map();
    byCv.set(evidence, bySkill);
  }
  const cached = bySkill.get(skillId);
  if (cached !== undefined) return cached;

  const own = ownMentions(evidence, taxonomy, skillId);
  const impliers = (taxonomy.impliersOf.get(skillId) ?? []).map((id) => ownMentions(evidence, taxonomy, id));
  const mentions = mergeMentions([own, ...impliers]);
  const tier =
    taxonomy.byId.get(skillId)?.group === 'SOFT_SKILL'
      ? softSkillTierOf(mentions)
      : tierOf(mentions, evidence.experienceIntervals);
  const found = { mentions, tier, own: own.length > 0 };
  bySkill.set(skillId, found);
  return found;
}

/** Evidence of a JD skill outside the catalogue: its key against new skills and technologies (D44). */
export function evidenceOfNewSkill(evidence: CvSkillEvidence, key: string): SkillEvidence {
  const mentions = mergeMentions([evidence.byNewKey.get(key) ?? NO_MENTIONS]);
  return { mentions, tier: tierOf(mentions, evidence.experienceIntervals), own: mentions.length > 0 };
}
