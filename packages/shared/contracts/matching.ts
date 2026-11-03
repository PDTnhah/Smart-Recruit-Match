import { z } from 'zod';
import { MAX_SKILLS_PER_GROUP, SkillLevelSchema } from './jd.js';

// Per-criterion verdicts of a CV against a JD (PRD › S_cv, AD-2, US-3.1, CONTEXT D41). Code computes
// S_cv from them (`apps/api/.../matching/domain/scv.ts`), so changing the weights never needs the
// LLM again. The skill verdicts come from code too (`matching/domain/skill-match.ts`, US-3.5,
// CONTEXT D42, D44), with the CV entries they rest on. No form displays these errors, so they are
// English; they reach the logs and the retry of a malformed answer.

export const MATCH_VERDICTS = ['MET', 'PARTIAL', 'NOT_MET'] as const;

export type MatchVerdict = (typeof MATCH_VERDICTS)[number];

/** How close the student's major is to the JD: đúng / gần / khác (PRD › S_cv, học vấn). */
export const MAJOR_MATCHES = ['EXACT', 'RELATED', 'OTHER'] as const;

export type MajorMatch = (typeof MAJOR_MATCHES)[number];

/** Highest project relevance score of the rubric (PRD › S_cv: 0–4, × 25). */
export const PROJECT_SCORE_MAX = 4;

/**
 * How a JD skill was found in the CV (PRD › Luật khớp kỹ năng, CONTEXT D44): the skill itself, only
 * through skills that imply it, through a skill of the same family, or not at all.
 */
export const MATCH_KINDS = ['EXACT', 'IMPLIED', 'FAMILY', 'NONE'] as const;

export type MatchKind = (typeof MATCH_KINDS)[number];

/** The CV list a source entry comes from. */
export const EVIDENCE_SECTIONS = ['SKILLS_LIST', 'PROJECT', 'EXPERIENCE', 'CERTIFICATE'] as const;

export type EvidenceSection = (typeof EVIDENCE_SECTIONS)[number];

/** Evidence tiers run T0 (none) to T4 (proficient) (PRD › Khung quy đổi mức bằng chứng). */
export const EVIDENCE_TIER_MAX = 4;

/** Most CV entries a skill verdict lists. */
export const MAX_VERDICT_SOURCES = 10;

export const MatchVerdictSchema = z.enum(MATCH_VERDICTS).meta({
  title: 'MatchVerdict',
  description:
    'MET = the CV shows the required level; PARTIAL = only listed, below the required level, or a skill of the same family; NOT_MET = no evidence',
});

export const MatchKindSchema = z.enum(MATCH_KINDS).meta({
  title: 'MatchKind',
  description:
    'EXACT = the CV shows the skill itself; IMPLIED = only skills that imply it; FAMILY = a skill of the same family; NONE = no match',
});

export const EvidenceSectionSchema = z
  .enum(EVIDENCE_SECTIONS)
  .meta({ title: 'EvidenceSection', description: 'CV list of a source entry: skills, projects, experience or certificates' });

export const MajorMatchSchema = z
  .enum(MAJOR_MATCHES)
  .meta({ title: 'MajorMatch', description: 'EXACT = the major the JD asks for, RELATED = a close major, OTHER = unrelated' });

const evidence = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .nullable()
  .describe('Quote copied from the CV that supports the verdict; null when NOT_MET');

/** MET and PARTIAL must quote the CV (AGENTS › Invariant 5); the AI Service checks the quote is real. */
function requireEvidence(item: { verdict: MatchVerdict; evidence: string | null }, ctx: z.RefinementCtx): void {
  if (item.verdict !== 'NOT_MET' && item.evidence === null) {
    ctx.addIssue({ code: 'custom', path: ['evidence'], message: `${item.verdict} needs evidence quoted from the CV` });
  }
}

// Runs while other fields are invalid too (LESSONS §10); waits only for the object and the fields
// the check reads.
const whenParsed = (fields: readonly PropertyKey[]) => ({
  when: (payload: z.core.ParsePayload) =>
    payload.issues.every((issue) => {
      const path = issue.path ?? [];
      return path.length > 0 && !fields.includes(path[0] ?? '');
    }),
});

const whenEvidenceParsed = whenParsed(['verdict', 'evidence']);

export const MatchSkillSourceSchema = z
  .strictObject({
    section: EvidenceSectionSchema,
    // A CV list holds at most 100 entries (skills).
    index: z.int().min(0).max(99).describe('Position of the entry in its CV list, from 0'),
    text: z.string().trim().min(1).max(1000).describe('The words of the entry that name the skill, copied from the CV'),
  })
  .meta({ title: 'MatchSkillSource', description: 'One CV entry that shows a skill' });

export type MatchSkillSource = z.output<typeof MatchSkillSourceSchema>;

interface MatchFields {
  verdict: MatchVerdict;
  match_kind: MatchKind;
  tier: number;
  via: string | null;
  sources: readonly unknown[];
}

/**
 * The verdict, match kind, tier and via of one skill agree (AC-12): NOT_MET ⇔ NONE ⇔ tier 0;
 * FAMILY gives PARTIAL only; IMPLIED and FAMILY name the skill they go through, EXACT and NONE do
 * not; NONE lists no source, every other kind at least one.
 */
function requireConsistentMatch(item: MatchFields, ctx: z.RefinementCtx): void {
  const issue = (field: keyof MatchFields, message: string) => ctx.addIssue({ code: 'custom', path: [field], message });
  const none = item.match_kind === 'NONE';
  if ((item.verdict === 'NOT_MET') !== none) issue('match_kind', `${item.verdict} cannot have match kind ${item.match_kind}`);
  if (item.match_kind === 'FAMILY' && item.verdict === 'MET') issue('verdict', 'FAMILY gives PARTIAL only');
  if ((item.tier === 0) !== none) issue('tier', `match kind ${item.match_kind} cannot have tier ${item.tier}`);
  const throughOther = item.match_kind === 'IMPLIED' || item.match_kind === 'FAMILY';
  if (throughOther && item.via === null) issue('via', `${item.match_kind} needs the skill it goes through`);
  if (!throughOther && item.via !== null) issue('via', `${item.match_kind} goes through no other skill`);
  if (none && item.sources.length > 0) issue('sources', 'NONE has no source');
  if (!none && item.sources.length === 0) issue('sources', `${item.match_kind} needs the CV entries it rests on`);
}

export const MatchSkillVerdictSchema = z
  .strictObject({
    skill: z.string().trim().min(1).max(100).describe('Skill name exactly as the JD requirements list it'),
    level_required: SkillLevelSchema,
    verdict: MatchVerdictSchema,
    evidence,
    match_kind: MatchKindSchema,
    tier: z
      .int()
      .min(0)
      .max(EVIDENCE_TIER_MAX)
      .describe('Evidence tier of the matched skill: 0 none, 1 listed, 2 used, 3 used often, 4 proficient (CONTEXT D44)'),
    via: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .nullable()
      .describe('Catalogue skill of the CV the match goes through for IMPLIED and FAMILY; null for EXACT and NONE'),
    sources: z
      .array(MatchSkillSourceSchema)
      .max(MAX_VERDICT_SOURCES)
      .describe('CV entries the tier rests on: experience, projects, certificates, then the skills list'),
  })
  .superRefine(requireEvidence, whenEvidenceParsed)
  .superRefine(requireConsistentMatch, whenParsed(['verdict', 'match_kind', 'tier', 'via', 'sources']))
  .meta({
    title: 'MatchSkillVerdict',
    description: 'Verdict on one skill of the JD, computed by code, with the CV entries it rests on',
  });

export type MatchSkillVerdict = z.output<typeof MatchSkillVerdictSchema>;

export const MatchProjectRelevanceSchema = z
  .strictObject({
    score_0_4: z
      .int()
      .min(0)
      .max(PROJECT_SCORE_MAX)
      .describe('Relevance, role and complexity of the projects and experience for this JD, 0 to 4'),
    reason: z.string().trim().min(1).max(1000).describe('Why this score, citing the projects it rests on'),
  })
  .meta({ title: 'MatchProjectRelevance', description: 'Rubric score of the relevant projects and experience' });

export const MatchEducationSchema = z
  .strictObject({
    major_match: MajorMatchSchema,
    major_unrecognized: z
      .boolean()
      .describe('The major is in no major group, or the student has none, so it counts as OTHER'),
  })
  .meta({
    title: 'MatchEducation',
    description:
      'Major against the JD, computed by code (CONTEXT D42, D45); the GPA comes from the school record, not from the CV (CONTEXT D41)',
  });

/** Longest `required` / `held` of a language verdict: ten entries of 100 characters with their CEFR levels. */
export const LANGUAGE_LIST_MAX = 2000;

export const MatchLanguageVerdictSchema = z
  .strictObject({
    verdict: MatchVerdictSchema,
    evidence,
    required: z
      .string()
      .trim()
      .min(1)
      .max(LANGUAGE_LIST_MAX)
      .describe('The required and preferred languages of the JD with their CEFR levels, joined by "; "'),
    held: z
      .string()
      .trim()
      .min(1)
      .max(LANGUAGE_LIST_MAX)
      .nullable()
      .describe('The languages and certificates of the student with their CEFR levels, joined by "; "; null when none'),
  })
  .superRefine(requireEvidence, whenEvidenceParsed)
  .meta({
    title: 'MatchLanguageVerdict',
    description: 'How well the languages and certificates meet the JD, computed by code (CONTEXT D42, D45)',
  });

export type MatchLanguageVerdict = z.output<typeof MatchLanguageVerdictSchema>;

export type MatchEducation = z.output<typeof MatchEducationSchema>;

export const MatchCriteriaSchema = z
  .strictObject({
    must_have: z
      .array(MatchSkillVerdictSchema)
      .max(MAX_SKILLS_PER_GROUP)
      .describe('One verdict per must-have skill of the JD'),
    nice_to_have: z
      .array(MatchSkillVerdictSchema)
      .max(MAX_SKILLS_PER_GROUP)
      .describe('One verdict per nice-to-have skill of the JD'),
    project_relevance: MatchProjectRelevanceSchema,
    education: MatchEducationSchema,
    language: MatchLanguageVerdictSchema.nullable().describe(
      'null when the JD neither requires nor prefers a foreign language',
    ),
  })
  .meta({ title: 'MatchCriteria', description: 'Per-criterion verdicts of the Matching Agent; code computes S_cv (AD-2)' });

export type MatchCriteria = z.output<typeof MatchCriteriaSchema>;
