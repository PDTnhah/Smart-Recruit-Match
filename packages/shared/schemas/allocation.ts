import { z } from 'zod';
import { ALLOCATION_ROUND_STATES } from '../states/allocation-round.js';
import { NOMINATION_STATES } from '../states/nomination.js';
import { RowVersionSchema } from './common.js';

// Allocation rounds (PRD GĐ7, FR-26, FR-27, NFR-4, US-5.2, CONTEXT D64): the draft the center
// reviews, its manual adjustments, publishing, and why a student is not at a JD they ranked higher.

const id = z.number().int().positive();
const instant = z.iso.datetime({ offset: true });
/** A score 0–100 with two decimals, as stored (numeric(5,2)). */
const score = z.number().min(0).max(100);

/**
 * Why a preference did not enter the engine (BR-07, AC-2): the hard filter failed, S_cv < θ_cv,
 * S_test < θ_test, or the test was never taken (BR-06, the preference is CLOSED).
 */
export const ALLOCATION_EXCLUSION_REASONS = ['HARD_FILTER', 'BELOW_THETA_CV', 'BELOW_THETA_TEST', 'TEST_NOT_TAKEN'] as const;

export type AllocationExclusionReason = (typeof ALLOCATION_EXCLUSION_REASONS)[number];

/**
 * Why a student is not at a JD they ranked above their result (NFR-4, AC-13): the JD was full with
 * students ranked higher, had no seat, the pair was not eligible, the student ranked last for an
 * offer declined before (BR-16), or the center changed the draft.
 */
export const ALLOCATION_OUTCOME_REASONS = [
  'FULL_WITH_HIGHER_RANKED',
  'ZERO_CAPACITY',
  'NOT_ELIGIBLE',
  'DEMOTED',
  'MANUAL_ADJUSTMENT',
] as const;

export type AllocationOutcomeReason = (typeof ALLOCATION_OUTCOME_REASONS)[number];

/**
 * What still keeps a round from running (AC-6): a preference whose test score is not final yet
 * (essays waiting for a grader, the test not closed), a session still within its appeal window, an
 * appeal still open (US-4.6), a graded preference whose pair has no match result under the current
 * rules and pinned prompt (matching must run again first).
 */
export const ALLOCATION_PENDING_KINDS = ['TEST_NOT_FINAL', 'APPEAL_WINDOW_OPEN', 'APPEAL_OPEN', 'MATCH_NOT_CURRENT'] as const;

export type AllocationPendingKind = (typeof ALLOCATION_PENDING_KINDS)[number];

/** For the center (staff wording). */
export const ALLOCATION_EXCLUSION_REASON_LABELS: Readonly<Record<AllocationExclusionReason, string>> = {
  HARD_FILTER: 'Không đạt điều kiện cứng của JD',
  BELOW_THETA_CV: 'Điểm phù hợp CV dưới ngưỡng',
  BELOW_THETA_TEST: 'Điểm test dưới ngưỡng',
  TEST_NOT_TAKEN: 'Không làm bài test',
};

/** Shown to the center and, without any figure of other students, to the student (PRD › Personas). */
export const ALLOCATION_OUTCOME_REASON_LABELS: Readonly<Record<AllocationOutcomeReason, string>> = {
  FULL_WITH_HIGHER_RANKED: 'JD đã đủ hồ sơ với các sinh viên xếp hạng cao hơn',
  ZERO_CAPACITY: 'JD không còn suất ở vòng này',
  NOT_ELIGIBLE: 'Chưa đủ điều kiện để được đề cử vào JD này',
  DEMOTED: 'Xếp sau do đã từ chối hoặc quá hạn xác nhận lời mời trước đó',
  MANUAL_ADJUSTMENT: 'Cán bộ Trung tâm đã điều chỉnh kết quả',
};

export const ALLOCATION_PENDING_KIND_LABELS: Readonly<Record<AllocationPendingKind, string>> = {
  TEST_NOT_FINAL: 'Bài test chưa có điểm cuối',
  APPEAL_WINDOW_OPEN: 'Còn trong hạn phúc khảo',
  APPEAL_OPEN: 'Đang phúc khảo',
  MATCH_NOT_CURRENT: 'Chưa có kết quả phù hợp theo bộ luật hiện tại',
};

// Requests.

const adjustmentReason = z
  .string({ error: 'Nhập lý do điều chỉnh' })
  .trim()
  .min(1, { error: 'Nhập lý do điều chỉnh' })
  .max(500, { error: 'Lý do tối đa 500 ký tự' });

/** BR-10: every manual change of a draft carries its reason. */
export const NominationAdjustmentSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('add'), studentId: id, jdId: id, reason: adjustmentReason }),
  z.strictObject({ op: z.literal('remove'), nominationId: id, reason: adjustmentReason }),
  z.strictObject({ op: z.literal('move'), nominationId: id, jdId: id, reason: adjustmentReason }),
]);

export type NominationAdjustment = z.output<typeof NominationAdjustmentSchema>;

export const NOMINATION_ADJUSTMENT_OPS = ['add', 'remove', 'move'] as const;

/** `PATCH /api/allocation-rounds/{id}/nominations`: applied in order, all or none. */
export const AdjustNominationsRequestSchema = z.strictObject({
  rowVersion: RowVersionSchema,
  operations: z.array(NominationAdjustmentSchema).min(1).max(50),
});

export type AdjustNominationsRequest = z.output<typeof AdjustNominationsRequestSchema>;

/** The center's form for one adjustment: a reason, and the JD for an add or a move (DESIGN.md §8). */
export const NominationAdjustmentFormSchema = z.object({
  /** Empty for a removal; the form of an add or a move requires it. */
  jdId: z.string(),
  reason: adjustmentReason,
});

export const NominationTargetFormSchema = NominationAdjustmentFormSchema.extend({
  jdId: z.string().min(1, { error: 'Chọn JD' }),
});

export type NominationAdjustmentForm = z.output<typeof NominationAdjustmentFormSchema>;

/**
 * `POST /api/campaigns/{id}/allocation-rounds`: the row version of the draft the caller saw, null
 * when they saw none. Running again over a draft changed since then is refused (AC-11).
 */
export const RunAllocationRequestSchema = z.strictObject({ rowVersion: RowVersionSchema.nullable() });

export type RunAllocationRequest = z.output<typeof RunAllocationRequestSchema>;

/** `POST /api/allocation-rounds/{id}/publish`. */
export const PublishAllocationRoundRequestSchema = z.strictObject({ rowVersion: RowVersionSchema });

export type PublishAllocationRoundRequest = z.output<typeof PublishAllocationRoundRequestSchema>;

// Responses.

export const AllocationRoundSummarySchema = z.object({
  id,
  campaignId: id,
  roundNo: z.number().int().min(1),
  status: z.enum(ALLOCATION_ROUND_STATES),
  ranAt: instant,
  publishedAt: instant.nullable(),
  rowVersion: z.number().int().min(0),
});

export type AllocationRoundSummary = z.output<typeof AllocationRoundSummarySchema>;

/** `GET /api/campaigns/{id}/allocation-rounds`: the campaign's rounds, round 1 first. */
export const AllocationRoundListSchema = z.object({ items: z.array(AllocationRoundSummarySchema) });

export type AllocationRoundList = z.output<typeof AllocationRoundListSchema>;

export const AllocationNominationViewSchema = z.object({
  id,
  studentId: id,
  studentCode: z.string(),
  fullName: z.string(),
  sFinal: score,
  /** Position at the JD under the engine's ranking, 1 = best. */
  rank: z.number().int().min(1),
  /** Which NV of the student this JD is. */
  preferenceRank: z.number().int().min(1),
  status: z.enum(NOMINATION_STATES),
  /** Set when the center added or moved it (BR-10). */
  overrideReason: z.string().nullable(),
});

export type AllocationNominationView = z.output<typeof AllocationNominationViewSchema>;

export const AllocationJdViewSchema = z.object({
  jdId: id,
  title: z.string(),
  companyName: z.string(),
  quota: z.number().int().min(0),
  /** C_j of the round. */
  capacity: z.number().int().min(0),
  nominated: z.number().int().min(0),
  /** nominated / C_j in whole percent, rounded down; null when C_j is 0. */
  fillPercent: z.number().int().min(0).max(100).nullable(),
  /** Fewer nominations than C_j: the JD lacks profiles. */
  short: z.boolean(),
  nominations: z.array(AllocationNominationViewSchema),
});

export type AllocationJdView = z.output<typeof AllocationJdViewSchema>;

/** An NV the student ranked above their result (every NV when they have none), and why they are not there. */
export const AllocationPreferenceOutcomeSchema = z.object({
  preferenceRank: z.number().int().min(1),
  jdId: id,
  title: z.string(),
  companyName: z.string(),
  reason: z.enum(ALLOCATION_OUTCOME_REASONS),
  /** With NOT_ELIGIBLE: which rules of BR-07 the pair failed. */
  exclusionReasons: z.array(z.enum(ALLOCATION_EXCLUSION_REASONS)),
});

export type AllocationPreferenceOutcome = z.output<typeof AllocationPreferenceOutcomeSchema>;

export const AllocationUnassignedViewSchema = z.object({
  studentId: id,
  studentCode: z.string(),
  fullName: z.string(),
  preferences: z.array(AllocationPreferenceOutcomeSchema),
});

export type AllocationUnassignedView = z.output<typeof AllocationUnassignedViewSchema>;

export const AllocationAdjustmentViewSchema = z.object({
  op: z.enum(NOMINATION_ADJUSTMENT_OPS),
  studentId: id,
  studentCode: z.string(),
  fromJdId: id.nullable(),
  toJdId: id.nullable(),
  reason: z.string(),
  actorId: id.nullable(),
  at: instant,
});

export type AllocationAdjustmentView = z.output<typeof AllocationAdjustmentViewSchema>;

/**
 * A pair the adjusted draft leaves unstable (AC-8): the student would rather have `jdId` and the JD
 * would rather have the student than `outranksStudentId` (null: the JD has a free seat). A warning,
 * never a block.
 */
export const AllocationStabilityWarningSchema = z.object({
  studentId: id,
  studentCode: z.string(),
  jdId: id,
  outranksStudentId: id.nullable(),
  outranksStudentCode: z.string().nullable(),
});

export type AllocationStabilityWarning = z.output<typeof AllocationStabilityWarningSchema>;

/** `GET /api/allocation-rounds/{id}` (AC-7), also the answer of run, adjust and publish. */
export const AllocationRoundViewSchema = AllocationRoundSummarySchema.extend({
  campaignName: z.string(),
  counts: z.object({
    /** Students with at least one eligible preference. */
    students: z.number().int().min(0),
    nominated: z.number().int().min(0),
    unassigned: z.number().int().min(0),
    /** Preferences BR-07 kept out of the engine. */
    excludedPairs: z.number().int().min(0),
  }),
  /** By JD title, then id. */
  jds: z.array(AllocationJdViewSchema),
  /** Students with an eligible preference and no nomination, by student code. */
  unassigned: z.array(AllocationUnassignedViewSchema),
  /** Oldest first. */
  adjustments: z.array(AllocationAdjustmentViewSchema),
  warnings: z.array(AllocationStabilityWarningSchema),
});

export type AllocationRoundView = z.output<typeof AllocationRoundViewSchema>;

/** The student's score at a JD and, for the center, the lowest one the JD kept. */
export const AllocationExplanationItemSchema = AllocationPreferenceOutcomeSchema.extend({
  /** S_final of the student at the JD; null when the pair never got one. */
  sFinal: score.nullable(),
  capacity: z.number().int().min(0),
  held: z.number().int().min(0),
  lowestHeld: z.object({ studentCode: z.string(), sFinal: score }).nullable(),
});

/** `GET /api/allocation-rounds/{id}/students/{studentId}/explanation` (CENTER, NFR-4). */
export const AllocationExplanationSchema = z.object({
  roundId: id,
  studentId: id,
  studentCode: z.string(),
  fullName: z.string(),
  nominatedJdId: id.nullable(),
  items: z.array(AllocationExplanationItemSchema),
});

export type AllocationExplanation = z.output<typeof AllocationExplanationSchema>;

/** One published round as the student sees it: only their own result and scores (PRD › Personas). */
export const MyAllocationResultSchema = z.object({
  campaignId: id,
  campaignName: z.string(),
  roundNo: z.number().int().min(1),
  publishedAt: instant,
  nomination: z
    .object({ jdId: id, title: z.string(), companyName: z.string(), status: z.enum(NOMINATION_STATES) })
    .nullable(),
  preferences: z.array(AllocationPreferenceOutcomeSchema.extend({ sFinal: score.nullable() })),
});

export type MyAllocationResult = z.output<typeof MyAllocationResultSchema>;

/** `GET /api/me/allocation-results`: newest round first. */
export const MyAllocationResultsSchema = z.object({ items: z.array(MyAllocationResultSchema) });

export type MyAllocationResults = z.output<typeof MyAllocationResultsSchema>;
