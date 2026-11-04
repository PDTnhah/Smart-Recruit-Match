import { z } from 'zod';
import { GPA_SCALE_MAX, POSITION_GROUPS, SkillLevelSchema } from '../contracts/jd.js';
import {
  type EvidenceCheck,
  type MatchAssessment,
  type MatchCriteria,
  MatchEducationSchema,
  MatchLanguageVerdictSchema,
  MatchSkillVerdictSchema,
  PROJECT_SCORE_MAX,
} from '../contracts/matching.js';
import { SKILL_ZONES } from '../contracts/skills.js';
import { APPLICATION_STATES } from '../states/application.js';
import { CAMPAIGN_STATES } from '../states/campaign.js';
import { PREFERENCES_MAX } from './campaign.js';
import type { ApiErrorCode } from './errors.js';
import { WORK_MODES } from './job-description.js';

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

const nonNegativeInt = () => z.int().min(0);

/**
 * One row per criterion. Values are rounded one by one for display; S_cv comes from the exact
 * fractions, so the contributions may add up to it ± 1.
 */
export const ScvBreakdownRowSchema = z.object({
  criterion: z.enum(SCV_CRITERIA),
  applicable: z.boolean(),
  /** sᵢ × 100; null when the criterion is empty. */
  scoreX100: nonNegativeInt().nullable(),
  /** wᵢ from the campaign config, in basis points. */
  weightBp: nonNegativeInt(),
  /** wᵢ after redistribution: 0 when empty, the applicable ones sum to 10 000 (± rounding). */
  effectiveWeightBp: nonNegativeInt(),
  /** wᵢ·sᵢ × 100 with the effective weight. */
  contributionX100: nonNegativeInt(),
});

export type ScvBreakdownRow = z.output<typeof ScvBreakdownRowSchema>;

/** How much of one field of work the JD needs and the CV covers (US-3.5 AC-9); display only. */
export const MatchZoneCoverageSchema = z.object({
  zone: z.enum(SKILL_ZONES),
  /** Weights of the JD skills in the zone, must-have and nice-to-have alike, × 100. */
  demandWeightX100: nonNegativeInt(),
  /** Weighted share met, MET = 1 and PARTIAL = 0.5, × 100: an integer 0–10 000. */
  coverageX100: nonNegativeInt().max(10_000),
});

export type MatchZoneCoverage = z.output<typeof MatchZoneCoverageSchema>;

/** A JD skill the CV shows only in part or not at all, listed by code from the verdicts (AC-12). */
export const MatchGapSchema = z.object({
  skill: z.string(),
  group: z.enum(['must_have', 'nice_to_have']),
  levelRequired: SkillLevelSchema,
  verdict: z.enum(['PARTIAL', 'NOT_MET']),
});

export type MatchGap = z.output<typeof MatchGapSchema>;

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

// --- Shortlist and preferences (FR-15, FR-16, US-3.3, CONTEXT D47) -----------------------------------
// `GET /api/me/shortlist` explains every suggestion from the stored result (NFR-4), without the LLM;
// `PUT /api/me/preferences` replaces the student's whole list. The subject always comes from the
// access token (AGENTS › Invariant 7).

/**
 * NO_CONFIRMED_CV: the student has no active confirmed CV in the campaign. SCORING: a matching run
 * of the campaign is running, or the CV has no result yet. READY: the lists are final for now, and
 * may be empty.
 */
export const SHORTLIST_STATES = ['NO_CONFIRMED_CV', 'SCORING', 'READY'] as const;

export type ShortlistState = (typeof SHORTLIST_STATES)[number];

const recordId = () => z.int().positive();

/** What the card of a JD shows. */
export const ShortlistJdSchema = z.object({
  id: recordId(),
  title: z.string(),
  companyName: z.string(),
  positionGroup: z.enum(POSITION_GROUPS).nullable(),
  location: z.string().nullable(),
  workMode: z.enum(WORK_MODES).nullable(),
});

export type ShortlistJd = z.output<typeof ShortlistJdSchema>;

/** The project score of the Matching Agent with its quotes; a quote not found in the CV is flagged (D46). */
export const ShortlistProjectSchema = z.object({
  score: z.int().min(0).max(PROJECT_SCORE_MAX),
  reason: z.string(),
  quotes: z.array(z.object({ quote: z.string(), matched: z.boolean() })),
});

/** One JD of the shortlist with the whole explanation of its S_cv (AC-1, AC-16, AC-17). */
export const ShortlistItemSchema = z.object({
  jd: ShortlistJdSchema,
  sCv: z.number().min(0).max(100),
  breakdown: z.array(ScvBreakdownRowSchema),
  skills: z.object({ must_have: z.array(MatchSkillVerdictSchema), nice_to_have: z.array(MatchSkillVerdictSchema) }),
  zones: z.array(MatchZoneCoverageSchema),
  language: MatchLanguageVerdictSchema.nullable(),
  education: MatchEducationSchema,
  project: ShortlistProjectSchema,
  gaps: z.array(MatchGapSchema),
  strengths: z.array(z.string()),
  suggestions: z.array(z.string()),
  summary: z.string(),
  /** Rank of the JD in the student's saved list; null when not chosen. */
  preferenceRank: recordId().nullable(),
});

export type ShortlistItem = z.output<typeof ShortlistItemSchema>;

/** A JD whose hard conditions the student does not meet (AC-2): no S_cv, cannot be chosen. */
export const IneligibleJdSchema = z.object({
  jd: ShortlistJdSchema,
  reasons: z.array(IneligibleReasonSchema).min(1),
});

export type IneligibleJd = z.output<typeof IneligibleJdSchema>;

/** One saved preference; NV1 has rank 1. */
export const PreferenceItemSchema = z.object({
  jdId: recordId(),
  rank: recordId(),
  status: z.enum(APPLICATION_STATES),
});

export type PreferenceItem = z.output<typeof PreferenceItemSchema>;

/** The campaign the shortlist belongs to, with what the preference screen needs. */
export const ShortlistCampaignSchema = z.object({
  id: recordId(),
  name: z.string(),
  status: z.enum(CAMPAIGN_STATES),
  preferenceEnd: z.iso.datetime({ offset: true }).nullable(),
  nNv: recordId(),
  requireFullPreferences: z.boolean(),
  /** In PREFERENCE_SELECTION and before `preference_end` by the server clock (AC-9). */
  editable: z.boolean(),
});

export type ShortlistCampaign = z.output<typeof ShortlistCampaignSchema>;

/** Body of `GET /api/me/shortlist`. */
export const ShortlistResponseSchema = z.object({
  state: z.enum(SHORTLIST_STATES),
  /** The campaign of the student's newest active CV, outside DRAFT and CLOSED; null when none. */
  campaign: ShortlistCampaignSchema.nullable(),
  /** Best S_cv first (`selectShortlist`). */
  items: z.array(ShortlistItemSchema),
  ineligible: z.array(IneligibleJdSchema),
  /** Eligible and scored, S_cv below θ_cv. */
  belowThresholdCount: count(),
  /** Eligible, never sent to the LLM: outside the top M of the CV, or left to staff. */
  notScoredCount: count(),
  /** Not judged yet, or waiting for the LLM. */
  pendingCount: count(),
  /** By rank. */
  preferences: z.array(PreferenceItemSchema),
});

export type ShortlistResponse = z.output<typeof ShortlistResponseSchema>;

/**
 * Body of `PUT /api/me/preferences` (AC-5): the whole new list, NV1 first. Only the shape is checked
 * here; N_NV, the shortlist and the ranks are checked by the API, each with its own code (AC-6).
 */
export const ReplacePreferencesRequestSchema = z.object({
  campaignId: recordId(),
  preferences: z
    .array(z.object({ jdId: recordId(), rank: recordId() }))
    .max(PREFERENCES_MAX, { error: `Tối đa ${PREFERENCES_MAX} nguyện vọng` }),
});

export type ReplacePreferencesRequest = z.output<typeof ReplacePreferencesRequestSchema>;

/** Body of `200` from `PUT /api/me/preferences`: the list as saved. */
export const PreferenceListSchema = z.object({
  campaignId: recordId(),
  preferences: z.array(PreferenceItemSchema),
});

export type PreferenceList = z.output<typeof PreferenceListSchema>;

/** Codes of `422` from `PUT /api/me/preferences` (AC-6, AC-8, BR-04). */
export const PREFERENCE_REJECTION_CODES = [
  'PREFERENCES_TOO_MANY',
  'PREFERENCE_NOT_IN_SHORTLIST',
  'PREFERENCE_DUPLICATE_JD',
  'PREFERENCE_RANK_NOT_CONTIGUOUS',
  'PREFERENCES_INCOMPLETE',
] as const satisfies readonly ApiErrorCode[];

export type PreferenceRejectionCode = (typeof PREFERENCE_REJECTION_CODES)[number];

/**
 * The message of each code, in Vietnamese, with the limit that was broken: the API sends it in
 * `message` for any client. The web words its own from the code, with the next step to take
 * (apps/web `shared/api/errors.ts`, DESIGN.md §9), as for every other code.
 */
export function preferenceRejectionMessage(
  code: PreferenceRejectionCode,
  limits: { nNv: number; required: number },
): string {
  switch (code) {
    case 'PREFERENCES_TOO_MANY':
      return `Chỉ được chọn tối đa ${limits.nNv} nguyện vọng`;
    case 'PREFERENCE_NOT_IN_SHORTLIST':
      return 'Chỉ chọn được JD trong danh sách gợi ý của mình';
    case 'PREFERENCE_DUPLICATE_JD':
      return 'Mỗi JD chỉ chọn được một lần';
    case 'PREFERENCE_RANK_NOT_CONTIGUOUS':
      return 'Thứ tự nguyện vọng phải liên tục từ NV1';
    case 'PREFERENCES_INCOMPLETE':
      return `Đợt này yêu cầu chọn đủ ${limits.required} nguyện vọng`;
  }
}
