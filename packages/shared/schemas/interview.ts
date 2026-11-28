import { z } from 'zod';
import { INTERVIEW_STATES } from '../states/interview.js';
import { NOMINATION_STATES } from '../states/nomination.js';
import { OFFER_STATES } from '../states/offer.js';
import { OFFER_DECLINE_POLICIES } from './campaign.js';
import { optionalText, RowVersionSchema } from './common.js';

// Interviews and internship offers (PRD GĐ9, FR-30, FR-31, BR-13…BR-16, US-5.4, CONTEXT D66): HR
// schedules an interview for a nomination it invited, the student confirms or asks once for another
// time, HR records the result. A PASSED nomination gets an offer the student answers before a
// deadline the server sets. No step asks an LLM (BR-13); who is promoted from the reserve list is
// a fixed rule.

const id = z.number().int().positive();
const instant = z.iso.datetime({ offset: true });
const score = z.number().min(0).max(100);

export const INTERVIEW_MODES = ['ONLINE', 'OFFLINE'] as const;

export type InterviewMode = (typeof INTERVIEW_MODES)[number];

export const INTERVIEW_MODE_LABELS: Readonly<Record<InterviewMode, string>> = {
  ONLINE: 'Trực tuyến',
  OFFLINE: 'Trực tiếp',
};

/** What HR records after the interview (GĐ9 step 2); ABSENT counts as FAILED. */
export const INTERVIEW_RESULTS = ['PASSED', 'RESERVE', 'FAILED', 'ABSENT'] as const;

export type InterviewResult = (typeof INTERVIEW_RESULTS)[number];

export const INTERVIEW_RESULT_LABELS: Readonly<Record<InterviewResult, string>> = {
  PASSED: 'Đạt',
  RESERVE: 'Dự bị',
  FAILED: 'Không đạt',
  ABSENT: 'Vắng',
};

/** Longest address or meeting link. */
export const INTERVIEW_LOCATION_MAX = 500;

/** Longest note of HR's result or of the student's reschedule request. */
export const INTERVIEW_NOTE_MAX = 1000;

const requiredText = (label: string, max: number) =>
  z
    .string({ error: `Nhập ${label}` })
    .trim()
    .min(1, { error: `Nhập ${label}` })
    .max(max, { error: `${label[0]!.toUpperCase()}${label.slice(1)} tối đa ${max} ký tự` });

/** When, how and where: what HR enters to schedule or move an interview. */
export const InterviewSlotSchema = z.object({
  scheduledAt: z.iso.datetime({ offset: true, error: 'Chọn thời gian phỏng vấn' }),
  mode: z.enum(INTERVIEW_MODES, { error: 'Chọn hình thức phỏng vấn' }),
  location: requiredText('địa điểm hoặc đường link', INTERVIEW_LOCATION_MAX),
});

export type InterviewSlot = z.output<typeof InterviewSlotSchema>;

/** `POST /api/interviews` (AC-1): one interview per nomination in INTERVIEW. */
export const ScheduleInterviewRequestSchema = InterviewSlotSchema.extend({ nominationId: id });

export type ScheduleInterviewRequest = z.output<typeof ScheduleInterviewRequestSchema>;

/** `PUT /api/interviews/{id}` (AC-2): a new time, at the interview's row version as HR read it. */
export const RescheduleInterviewRequestSchema = InterviewSlotSchema.extend({ rowVersion: RowVersionSchema });

export type RescheduleInterviewRequest = z.output<typeof RescheduleInterviewRequestSchema>;

/** `POST /api/interviews/{id}/confirm`, `POST /api/offers/{id}/accept|decline`: the row version read. */
export const RowVersionBodySchema = z.object({ rowVersion: RowVersionSchema });

export type RowVersionBody = z.output<typeof RowVersionBodySchema>;

/** `POST /api/interviews/{id}/reschedule-request` (AC-2): once per interview, with the reason. */
export const RescheduleRequestBodySchema = z.object({
  rowVersion: RowVersionSchema,
  note: requiredText('lý do xin đổi lịch', INTERVIEW_NOTE_MAX),
});

export type RescheduleRequestBody = z.output<typeof RescheduleRequestBodySchema>;

/** `PUT /api/interviews/{id}/result` (AC-3): HR's result and note (BR-13). */
export const InterviewResultRequestSchema = z.object({
  result: z.enum(INTERVIEW_RESULTS, { error: 'Chọn kết quả phỏng vấn' }),
  note: optionalText('Nhận xét', INTERVIEW_NOTE_MAX),
  rowVersion: RowVersionSchema,
});

export type InterviewResultRequest = z.output<typeof InterviewResultRequestSchema>;

/** The result dialog: the same fields before submit. */
export const InterviewResultFormSchema = InterviewResultRequestSchema.omit({ rowVersion: true });

export type InterviewResultForm = z.input<typeof InterviewResultFormSchema>;

/** An interview as the student sees it: HR's note on the result stays with staff. */
export const InterviewViewSchema = z.object({
  interviewId: id,
  nominationId: id,
  status: z.enum(INTERVIEW_STATES),
  scheduledAt: instant,
  mode: z.enum(INTERVIEW_MODES),
  location: z.string(),
  confirmedAt: instant.nullable(),
  /** Set by the one reschedule request the student may make; kept after HR moved the time. */
  rescheduleRequestedAt: instant.nullable(),
  rescheduleNote: z.string().nullable(),
  result: z.enum(INTERVIEW_RESULTS).nullable(),
  resultAt: instant.nullable(),
  rowVersion: RowVersionSchema,
});

export type InterviewView = z.output<typeof InterviewViewSchema>;

/** An interview as HR and the center see it. */
export const StaffInterviewViewSchema = InterviewViewSchema.extend({ resultNote: z.string().nullable() });

export type StaffInterviewView = z.output<typeof StaffInterviewViewSchema>;

/** An offer; `expiresAt` is the server's deadline, the page only counts down to it (AC-5). */
export const OfferViewSchema = z.object({
  offerId: id,
  nominationId: id,
  status: z.enum(OFFER_STATES),
  sentAt: instant,
  expiresAt: instant,
  respondedAt: instant.nullable(),
  rowVersion: RowVersionSchema,
});

export type OfferView = z.output<typeof OfferViewSchema>;

/** Places of a JD (BR-14): accepted, PASSED waiting for the student's answer, on the reserve list. */
export const JdSlotsSchema = z.object({
  quota: z.number().int().min(0),
  accepted: z.number().int().min(0),
  passed: z.number().int().min(0),
  reserve: z.number().int().min(0),
});

export type JdSlots = z.output<typeof JdSlotsSchema>;

/**
 * Body of `200` from `PUT /api/interviews/{id}/result`: where the nomination went. `reservedForQuota`
 * tells HR its PASSED became RESERVE because the JD had no place left (AC-4); a RESERVE of a JD that
 * has accepted its quota is CLOSED at once (AC-9).
 */
export const InterviewResultResponseSchema = z.object({
  nominationId: id,
  nominationStatus: z.enum(NOMINATION_STATES),
  reservedForQuota: z.boolean(),
  interview: StaffInterviewViewSchema,
  offer: OfferViewSchema.nullable(),
  slots: JdSlotsSchema,
});

export type InterviewResultResponse = z.output<typeof InterviewResultResponseSchema>;

/** Body of `200` from accept / decline: the offer and its nomination as the answer left them. */
export const OfferAnswerResponseSchema = z.object({
  offer: OfferViewSchema,
  nominationStatus: z.enum(NOMINATION_STATES),
});

export type OfferAnswerResponse = z.output<typeof OfferAnswerResponseSchema>;

/**
 * `GET /api/jds/{id}/interviews` (AC-12, HR of the company and the center): every nomination HR
 * invited, by S_final then the tie-breaks of US-5.1, with its interview and offer.
 */
export const JdInterviewListSchema = z.object({
  jd: z.object({ jdId: id, title: z.string(), campaignId: id }),
  slots: JdSlotsSchema,
  items: z.array(
    z.object({
      nominationId: id,
      nominationStatus: z.enum(NOMINATION_STATES),
      student: z.object({ studentId: id, studentCode: z.string(), fullName: z.string() }),
      sFinal: score,
      interview: StaffInterviewViewSchema.nullable(),
      offer: OfferViewSchema.nullable(),
    }),
  ),
});

export type JdInterviewList = z.output<typeof JdInterviewListSchema>;

/**
 * `GET /api/me/interviews` (AC-12): the student's own interviews and offers, by nomination id,
 * newest first. `offerDeclinePolicy` is what declining means in the campaign (Q4, BR-16).
 */
export const MyInterviewsSchema = z.object({
  items: z.array(
    z.object({
      nominationId: id,
      nominationStatus: z.enum(NOMINATION_STATES),
      jd: z.object({ jdId: id, title: z.string(), companyName: z.string() }),
      interview: InterviewViewSchema.nullable(),
      offer: OfferViewSchema.nullable(),
      offerDeclinePolicy: z.enum(OFFER_DECLINE_POLICIES),
    }),
  ),
});

export type MyInterviews = z.output<typeof MyInterviewsSchema>;
