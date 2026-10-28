import { z } from 'zod';
import { MAX_SKILLS_PER_GROUP, SkillLevelSchema } from './jd.js';

// Per-criterion verdicts of the Matching Agent (PRD › S_cv, AD-2, US-3.1, CONTEXT D41). The LLM
// returns them with evidence; code computes S_cv from them (`apps/api/.../matching/domain/scv.ts`),
// so changing the weights never needs the LLM again. No form displays these errors, so they are
// English; they reach the logs and the retry of a malformed answer.

export const MATCH_VERDICTS = ['MET', 'PARTIAL', 'NOT_MET'] as const;

export type MatchVerdict = (typeof MATCH_VERDICTS)[number];

/** How close the student's major is to the JD: đúng / gần / khác (PRD › S_cv, học vấn). */
export const MAJOR_MATCHES = ['EXACT', 'RELATED', 'OTHER'] as const;

export type MajorMatch = (typeof MAJOR_MATCHES)[number];

/** Highest project relevance score of the rubric (PRD › S_cv: 0–4, × 25). */
export const PROJECT_SCORE_MAX = 4;

export const MatchVerdictSchema = z.enum(MATCH_VERDICTS).meta({
  title: 'MatchVerdict',
  description:
    'MET = shown by a project or experience in the CV; PARTIAL = only listed, or below the required level; NOT_MET = no evidence',
});

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

const EVIDENCE_FIELDS: readonly PropertyKey[] = ['verdict', 'evidence'];

/** MET and PARTIAL must quote the CV (AGENTS › Invariant 5); the AI Service checks the quote is real. */
function requireEvidence(item: { verdict: MatchVerdict; evidence: string | null }, ctx: z.RefinementCtx): void {
  if (item.verdict !== 'NOT_MET' && item.evidence === null) {
    ctx.addIssue({ code: 'custom', path: ['evidence'], message: `${item.verdict} needs evidence quoted from the CV` });
  }
}

// Runs while other fields are invalid too (LESSONS §10); waits only for the object and the two
// fields it reads.
const whenEvidenceParsed = {
  when: (payload: z.core.ParsePayload) =>
    payload.issues.every((issue) => {
      const path = issue.path ?? [];
      return path.length > 0 && !EVIDENCE_FIELDS.includes(path[0] ?? '');
    }),
};

export const MatchSkillVerdictSchema = z
  .strictObject({
    skill: z.string().trim().min(1).max(100).describe('Skill name exactly as the JD requirements list it'),
    level_required: SkillLevelSchema,
    verdict: MatchVerdictSchema,
    evidence,
  })
  .superRefine(requireEvidence, whenEvidenceParsed)
  .meta({ title: 'MatchSkillVerdict', description: 'Verdict on one skill of the JD, with evidence from the CV' });

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
  .strictObject({ major_match: MajorMatchSchema })
  .meta({
    title: 'MatchEducation',
    description: 'Major against the JD; the GPA comes from the school record, not from the CV (CONTEXT D41)',
  });

export const MatchLanguageVerdictSchema = z
  .strictObject({ verdict: MatchVerdictSchema, evidence })
  .superRefine(requireEvidence, whenEvidenceParsed)
  .meta({ title: 'MatchLanguageVerdict', description: 'How well the languages and certificates meet the JD' });

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
    language: MatchLanguageVerdictSchema.nullable().describe('null when the JD requires no foreign language'),
  })
  .meta({ title: 'MatchCriteria', description: 'Per-criterion verdicts of the Matching Agent; code computes S_cv (AD-2)' });

export type MatchCriteria = z.output<typeof MatchCriteriaSchema>;
