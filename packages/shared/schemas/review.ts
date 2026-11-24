import { z } from 'zod';
import { CvProfileSchema } from '../contracts/cv.js';
import { NOMINATION_STATES } from '../states/nomination.js';
import { optionalText, RowVersionSchema, whenValid } from './common.js';
import { CvTrustViewSchema } from './cv-trust.js';
import { ExamResultSkillSchema } from './exam-result.js';
import { ShortlistItemSchema } from './matching.js';

// HR review of nominations (PRD GĐ8, FR-28, FR-29, BR-11…BR-13, US-5.3, CONTEXT D65): HR reads the
// nominations of their own JDs from published rounds, opens one with its evidence, invites or
// rejects with a reason, and asks for more candidates when too few were invited. Nothing here is
// decided by AI (BR-13): every decision is HR's input.

const id = z.number().int().positive();
const instant = z.iso.datetime({ offset: true });
/** A score 0–100 with two decimals, as stored (numeric(5,2)). */
const score = z.number().min(0).max(100);

/** What HR decides for a nomination (GĐ8 step 2). */
export const HR_DECISIONS = ['INVITE', 'REJECT'] as const;

export type HrDecision = (typeof HR_DECISIONS)[number];

export const HR_DECISION_LABELS: Readonly<Record<HrDecision, string>> = {
  INVITE: 'Mời phỏng vấn',
  REJECT: 'Từ chối',
};

/**
 * Catalogue of rejection reasons (GĐ8 step 2, BR-12). Stored to evaluate and tune the models (PRD ›
 * Vòng phản hồi); the student sees the label only, never HR's note.
 */
export const HR_REJECT_REASONS = ['MISSING_SKILLS', 'TEST_BELOW_EXPECTATION', 'POSITION_FILLED', 'OTHER'] as const;

export type HrRejectReason = (typeof HR_REJECT_REASONS)[number];

export const HR_REJECT_REASON_LABELS: Readonly<Record<HrRejectReason, string>> = {
  MISSING_SKILLS: 'Thiếu kỹ năng',
  TEST_BELOW_EXPECTATION: 'Kết quả test chưa đạt kỳ vọng',
  POSITION_FILLED: 'Đã đủ người',
  OTHER: 'Lý do khác',
};

/** Longest note HR may write with a decision or a supplement request. */
export const HR_REVIEW_NOTE_MAX = 1000;

/** Longest reason the center gives for an extension. */
export const REVIEW_EXTENSION_REASON_MAX = 500;

const requiredNote = (label: string, max: number) =>
  z
    .string({ error: `Nhập ${label}` })
    .trim()
    .min(1, { error: `Nhập ${label}` })
    .max(max, { error: `${label[0]!.toUpperCase()}${label.slice(1)} tối đa ${max} ký tự` });

/**
 * `POST /api/nominations/{id}/decision` (AC-5, AC-6): INVITE, or REJECT with a reason of the
 * catalogue and a note (BR-12); an invitation ignores both. `rowVersion` is the nomination's, as
 * the page read it (AC-7). An object, not a union, so the API's DTO can be built from it.
 */
export const HrDecisionRequestSchema = z
  .object({
    decision: z.enum(HR_DECISIONS, { error: 'Chọn quyết định' }),
    rowVersion: RowVersionSchema,
    reasonCode: z.enum(HR_REJECT_REASONS, { error: 'Chọn lý do từ chối' }).nullable().optional(),
    note: optionalText('Ghi chú', HR_REVIEW_NOTE_MAX),
  })
  .superRefine((value, ctx) => {
    if (value.decision !== 'REJECT') return;
    if (!value.reasonCode) ctx.addIssue({ code: 'custom', path: ['reasonCode'], message: 'Chọn lý do từ chối' });
    if (!value.note) ctx.addIssue({ code: 'custom', path: ['note'], message: 'Nhập ghi chú' });
  }, whenValid(['decision', 'reasonCode', 'note']));

export type HrDecisionRequest = z.output<typeof HrDecisionRequestSchema>;

/** The reject dialog: the same rules, before a decision is picked. */
export const HrRejectFormSchema = z.object({
  reasonCode: z.enum(HR_REJECT_REASONS, { error: 'Chọn lý do từ chối' }),
  note: requiredNote('ghi chú', HR_REVIEW_NOTE_MAX),
});

export type HrRejectForm = z.input<typeof HrRejectFormSchema>;

/** A decision as stored in `hr_reviews`, for HR and the center (never the note for students). */
export const HrReviewSchema = z.object({
  decision: z.enum(HR_DECISIONS),
  reasonCode: z.enum(HR_REJECT_REASONS).nullable(),
  note: z.string().nullable(),
  decidedAt: instant,
});

export type HrReview = z.output<typeof HrReviewSchema>;

/** Body of `200` from the decision route: the nomination as the decision left it. */
export const HrDecisionResultSchema = z.object({
  nominationId: id,
  status: z.enum(NOMINATION_STATES),
  rowVersion: RowVersionSchema,
  review: HrReviewSchema,
});

export type HrDecisionResult = z.output<typeof HrDecisionResultSchema>;

const NominationStudentSchema = z.object({ studentId: id, studentCode: z.string(), fullName: z.string() });

/** One row of the HR table (AC-1): no AI summary, so nothing but scores orders it (BR-13). */
export const NominationListItemSchema = z.object({
  nominationId: id,
  roundNo: z.number().int().min(1),
  publishedAt: instant,
  student: NominationStudentSchema,
  /** The S_cv and S_test S_final was computed from, as the round's snapshot keeps them. */
  sCv: score.nullable(),
  sTest: score.nullable(),
  sFinal: score,
  status: z.enum(NOMINATION_STATES),
  /** When HR should have answered (AC-10): published_at + SLA_HR working days, or the extension. */
  reviewDueAt: instant,
  rowVersion: RowVersionSchema,
  review: HrReviewSchema.nullable(),
});

export type NominationListItem = z.output<typeof NominationListItemSchema>;

/** Whether HR may ask for more candidates (AC-9) and why not. */
export const SUPPLEMENT_BLOCKS = ['NO_PUBLISHED_ROUND', 'QUOTA_REACHED', 'ALREADY_REQUESTED', 'PHASE_CLOSED'] as const;

export type SupplementBlock = (typeof SUPPLEMENT_BLOCKS)[number];

/**
 * `GET /api/jds/{id}/nominations` (AC-1): every nomination of the JD in a published round, by S_final
 * then the tie-breaks of US-5.1. `invitedCount` counts INTERVIEW, PASSED, RESERVE and ACCEPTED.
 */
export const JdNominationListSchema = z.object({
  jd: z.object({ jdId: id, title: z.string(), quota: z.number().int().min(0), campaignId: id }),
  invitedCount: z.number().int().min(0),
  supplement: z.object({
    /** Null when HR may ask now. */
    blockedBy: z.enum(SUPPLEMENT_BLOCKS).nullable(),
    /** When HR asked in the current round; null if not. */
    requestedAt: instant.nullable(),
  }),
  items: z.array(NominationListItemSchema),
});

export type JdNominationList = z.output<typeof JdNominationListSchema>;

/** The S_cv explanation of the pair (AC-2), from the stored match result; never asks the LLM again. */
export const NominationMatchSchema = ShortlistItemSchema.pick({
  sCv: true,
  breakdown: true,
  skills: true,
  zones: true,
  language: true,
  education: true,
  project: true,
  gaps: true,
});

export type NominationMatch = z.output<typeof NominationMatchSchema>;

/** Warnings of the test for staff (Invariant 8): shown with "chỉ để cảnh báo", they never decide. */
export const NOMINATION_WARNING_CODES = ['INSTRUCTION_IN_ANSWER'] as const;

export type NominationWarningCode = (typeof NOMINATION_WARNING_CODES)[number];

export const NOMINATION_WARNING_LABELS: Readonly<Record<NominationWarningCode, string>> = {
  INSTRUCTION_IN_ANSWER: 'Bài tự luận có câu giống chỉ dẫn cho AI chấm bài',
};

/**
 * `GET /api/nominations/{id}` (AC-2): what HR needs to decide. The CV file is fetched through
 * `GET /api/files/{cv.fileId}/url` (5 minutes, US-1.6). No answer key, rubric or answer of the
 * test; the only answers shown are those of part C, inside `cvTrust` (US-4.8 AC-7).
 */
export const NominationDetailSchema = z.object({
  nominationId: id,
  rowVersion: RowVersionSchema,
  status: z.enum(NOMINATION_STATES),
  roundNo: z.number().int().min(1),
  publishedAt: instant,
  reviewDueAt: instant,
  jd: z.object({ jdId: id, title: z.string() }),
  student: NominationStudentSchema,
  scores: z.object({ sCv: score.nullable(), sTest: score.nullable(), sFinal: score }),
  /** The student's CV in the campaign: the original file and the competence profile (no PII section). */
  cv: z
    .object({
      fileId: z.string(),
      fileName: z.string(),
      profile: CvProfileSchema.nullable(),
    })
    .nullable(),
  match: NominationMatchSchema.nullable(),
  test: z
    .object({
      submittedAt: instant.nullable(),
      skills: z.array(ExamResultSkillSchema),
    })
    .nullable(),
  cvTrust: CvTrustViewSchema,
  warnings: z.array(z.object({ code: z.enum(NOMINATION_WARNING_CODES), count: z.number().int().min(1) })),
  review: HrReviewSchema.nullable(),
});

export type NominationDetail = z.output<typeof NominationDetailSchema>;

/** `POST /api/jds/{id}/supplement-requests` (AC-9). */
export const SupplementRequestBodySchema = z.object({ note: requiredNote('ghi chú', HR_REVIEW_NOTE_MAX) });

export type SupplementRequestBody = z.output<typeof SupplementRequestBodySchema>;

export const SupplementRequestSchema = z.object({
  id,
  campaignId: id,
  jdId: id,
  roundId: id,
  note: z.string(),
  invitedCount: z.number().int().min(0),
  quota: z.number().int().min(0),
  createdAt: instant,
});

export type SupplementRequest = z.output<typeof SupplementRequestSchema>;

/**
 * `POST /api/jds/{id}/review-deadline-extensions` (AC-10): the center moves HR's deadline for the
 * JD's nominations of one round to a later time, with a reason.
 */
export const ReviewDeadlineExtensionRequestSchema = z.object({
  roundId: id,
  dueAt: instant,
  reason: requiredNote('lý do gia hạn', REVIEW_EXTENSION_REASON_MAX),
});

export type ReviewDeadlineExtensionRequest = z.output<typeof ReviewDeadlineExtensionRequestSchema>;

/** HR's deadline for one JD of a published round (AC-10), for the center and US-5.5. */
export const ReviewDeadlineSchema = z.object({
  roundId: id,
  jdId: id,
  jdTitle: z.string(),
  companyName: z.string(),
  dueAt: instant,
  extended: z.boolean(),
  /** Nominations of the JD in the round HR has not decided on. */
  pendingCount: z.number().int().min(0),
  nominationCount: z.number().int().min(0),
});

export type ReviewDeadline = z.output<typeof ReviewDeadlineSchema>;

/** `GET /api/allocation-rounds/{id}/review-deadlines`: by JD title. */
export const ReviewDeadlineListSchema = z.object({ items: z.array(ReviewDeadlineSchema) });

export type ReviewDeadlineList = z.output<typeof ReviewDeadlineListSchema>;

/**
 * `GET /api/me/nomination-reviews` (AC-6): the decisions on the student's own nominations, with the
 * reason as a catalogue code only; HR's note never leaves the staff side.
 */
export const MyNominationReviewsSchema = z.object({
  items: z.array(
    z.object({ nominationId: id, decision: z.enum(HR_DECISIONS), reasonCode: z.enum(HR_REJECT_REASONS).nullable() }),
  ),
});

export type MyNominationReviews = z.output<typeof MyNominationReviewsSchema>;
