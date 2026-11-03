import { z } from 'zod';
import { GPA_SCALE_MAX, type SkillLevel } from '../contracts/jd.js';
import type { EvidenceCheck, MatchAssessment, MatchCriteria, MatchVerdict } from '../contracts/matching.js';
import type { SkillZone } from '../contracts/skills.js';

// Hard filter of GĐ3 (FR-14, US-3.1, CONTEXT D41): code checks the hard conditions of a JD before
// any LLM call, and a pair that fails is "Không đủ điều kiện" with one reason per failed condition.

/**
 * What the hard filter reads about a student. Nothing else is accepted: photo, gender, date of
 * birth, hometown, religion and marital status never reach a scoring step (BR-03).
 */
export const HardFilterFactsSchema = z.strictObject({
  major: z.string().trim().min(1).max(200).nullable(),
  /** Read from the confirmed profile by US-3.2 (CONTEXT D46); null when it cannot be. */
  yearOfStudy: z.int().min(1).max(6).nullable(),
  /** `students.gpa`, on the 4-point scale of `min_gpa`. */
  gpa4: z.number().min(0).max(GPA_SCALE_MAX).multipleOf(0.01).nullable(),
  /** Each language with its level and each certificate name of the confirmed profile, as written. */
  languageCertificates: z.array(z.string().trim().min(1).max(200)).max(50),
});

export type HardFilterFacts = z.output<typeof HardFilterFactsSchema>;

export const INELIGIBLE_REASON_CODES = [
  'MAJOR_NOT_ALLOWED',
  'MAJOR_MISSING',
  'YEAR_BELOW_MIN',
  'YEAR_MISSING',
  'GPA_BELOW_MIN',
  'GPA_MISSING',
  'LANGUAGE_NOT_MET',
] as const;

export type IneligibleReasonCode = (typeof INELIGIBLE_REASON_CODES)[number];

const reason = <C extends IneligibleReasonCode, R extends z.ZodType, A extends z.ZodType>(
  code: C,
  required: R,
  actual: A,
) => z.strictObject({ code: z.literal(code), required, actual });

const majors = z.array(z.string());

/** One failed condition: what the JD requires and what the student has (`null` when unknown). */
export const IneligibleReasonSchema = z.discriminatedUnion('code', [
  reason('MAJOR_NOT_ALLOWED', majors, z.string()),
  reason('MAJOR_MISSING', majors, z.null()),
  reason('YEAR_BELOW_MIN', z.int(), z.int()),
  reason('YEAR_MISSING', z.int(), z.null()),
  reason('GPA_BELOW_MIN', z.number(), z.number()),
  reason('GPA_MISSING', z.number(), z.null()),
  // One reason per required language; `actual` lists the student's languages and certificates.
  reason('LANGUAGE_NOT_MET', z.string(), z.array(z.string())),
]);

export type IneligibleReason = z.output<typeof IneligibleReasonSchema>;

// --- Stored result of a pair (US-3.2 AC-12, NFR-4, CONTEXT D46) -------------------------------------
// What core.match_results keeps for one CV × JD pair, so the shortlist (US-3.3) explains every score
// without asking the LLM again.

/** The S_cv criteria in PRD › S_cv table order. */
export const SCV_CRITERIA = ['must_have', 'nice_to_have', 'project', 'education', 'language'] as const;

export type ScvCriterion = (typeof SCV_CRITERIA)[number];

/**
 * One row per criterion. Values are rounded one by one for display; S_cv comes from the exact
 * fractions, so the contributions may add up to it ± 1.
 */
export interface ScvBreakdownRow {
  criterion: ScvCriterion;
  applicable: boolean;
  /** sᵢ × 100; null when the criterion is empty. */
  scoreX100: number | null;
  /** wᵢ from the campaign config, in basis points. */
  weightBp: number;
  /** wᵢ after redistribution: 0 when empty, the applicable ones sum to 10 000 (± rounding). */
  effectiveWeightBp: number;
  /** wᵢ·sᵢ × 100 with the effective weight. */
  contributionX100: number;
}

/** How much of one field of work the JD needs and the CV covers (US-3.5 AC-9); display only. */
export interface MatchZoneCoverage {
  zone: SkillZone;
  /** Weights of the JD skills in the zone, must-have and nice-to-have alike, × 100. */
  demandWeightX100: number;
  /** Weighted share met, MET = 1 and PARTIAL = 0.5, × 100: an integer 0–10 000. */
  coverageX100: number;
}

/** A JD skill the CV shows only in part or not at all, listed by code from the verdicts (AC-12). */
export interface MatchGap {
  skill: string;
  group: 'must_have' | 'nice_to_have';
  levelRequired: SkillLevel;
  verdict: Exclude<MatchVerdict, 'MET'>;
}

/** The criteria code judges (CONTEXT D42): every verdict but the project score, with zones and gaps. */
export type MatchCodeCriteria = Omit<MatchCriteria, 'project_relevance'> & {
  zones: MatchZoneCoverage[];
  gaps: MatchGap[];
};

/** What the Matching Agent returned for the pair, with the check of each quote (CONTEXT D46). */
export type StoredMatchAssessment = MatchAssessment & { evidence_check: EvidenceCheck[] };

// --- Matching runs (US-3.2 AC-1, AC-13) -----------------------------------------------------------

/** RUNNING until the last result of its job; a run with nothing to send ends SUCCEEDED at once. */
export const MATCH_RUN_STATUSES = ['RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED'] as const;

export type MatchRunStatus = (typeof MATCH_RUN_STATUSES)[number];

const count = () => z.int().min(0);

/** Body of `202` from `POST /api/campaigns/{id}/matching-runs`: what the run stored and sent. */
export const MatchingRunSchema = z.object({
  runId: z.int().positive(),
  /** The `ai.match.run` job; null when every pair was ineligible, outside the top M or scored. */
  jobId: z.uuid().nullable(),
  status: z.enum(MATCH_RUN_STATUSES),
  rulesVersion: z.string(),
  /** Prompt the campaign is pinned to; null when the run takes the active one (CONTEXT D46). */
  promptVersion: z.string().nullable(),
  pairsTotal: count(),
  pairsIneligible: count(),
  pairsSkipped: count(),
  pairsCached: count(),
  pairsSent: count(),
});

export type MatchingRun = z.output<typeof MatchingRunSchema>;
