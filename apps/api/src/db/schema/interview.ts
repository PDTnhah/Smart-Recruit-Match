import {
  INTERVIEW_MODES,
  INTERVIEW_RESULTS,
  INTERVIEW_STATES,
  type InterviewMode,
  type InterviewResult,
  type InterviewStatus,
  OFFER_STATES,
  type OfferStatus,
} from '@srm/shared';
import { sql } from 'drizzle-orm';
import { check, index, text, unique } from 'drizzle-orm/pg-core';
import { nominations } from './allocation.js';
import { id, oneOf, ref, rowVersion, timestamptz } from './columns.js';
import { core } from './core.js';
import { users } from './users.js';

/**
 * The interview of a nomination HR invited (PRD GĐ9, FR-30, US-5.4, CONTEXT D66), owned by the
 * interview module; its lifecycle is `interviewMachine`. One per nomination (AC-1, AGENTS ›
 * Invariant 11). `reschedule_requested_at` is the student's one request, kept after HR moved the
 * time, so a second request fails at the database too. `result` is what was applied: HR's PASSED is
 * stored as RESERVE when the JD had no place left (BR-14); `result_at` starts the reserve's time.
 */
export const interviews = core.table(
  'interviews',
  {
    id: id(),
    nominationId: ref('nomination_id')
      .notNull()
      .references(() => nominations.id),
    status: text('status').$type<InterviewStatus>().notNull(),
    scheduledAt: timestamptz('scheduled_at').notNull(),
    mode: text('mode').$type<InterviewMode>().notNull(),
    location: text('location').notNull(),
    confirmedAt: timestamptz('confirmed_at'),
    rescheduleRequestedAt: timestamptz('reschedule_requested_at'),
    rescheduleNote: text('reschedule_note'),
    result: text('result').$type<InterviewResult>(),
    resultNote: text('result_note'),
    resultAt: timestamptz('result_at'),
    resultBy: ref('result_by').references(() => users.id),
    createdBy: ref('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamptz('created_at').notNull(),
    rowVersion: rowVersion(),
  },
  (t) => [
    unique('interviews_nomination_id_key').on(t.nominationId),
    oneOf('interviews_status_check', t.status, INTERVIEW_STATES),
    oneOf('interviews_mode_check', t.mode, INTERVIEW_MODES),
    oneOf('interviews_result_check', t.result, INTERVIEW_RESULTS),
    check('interviews_location_check', sql`btrim(${t.location}) <> ''`),
    check('interviews_confirmed_check', sql`${t.status} <> 'CONFIRMED' or ${t.confirmedAt} is not null`),
    check(
      'interviews_reschedule_check',
      sql`(${t.status} <> 'RESCHEDULE_REQUESTED' or ${t.rescheduleRequestedAt} is not null) and (${t.rescheduleNote} is null) = (${t.rescheduleRequestedAt} is null)`,
    ),
    // BR-13: a result is HR's, recorded once, and only a DONE interview has one.
    check(
      'interviews_result_done_check',
      sql`(${t.status} = 'DONE') = (${t.result} is not null) and (${t.result} is null) = (${t.resultAt} is null) and (${t.result} is null) = (${t.resultBy} is null)`,
    ),
  ],
);

/**
 * The internship offer of a PASSED nomination (GĐ9 step 3, FR-31, US-5.4 AC-5…AC-8), owned by the
 * interview module; its lifecycle is `offerMachine` (ARCHITECTURE's `response` is the status, with
 * PENDING before the answer). One per nomination: a nomination turns PASSED once. `expires_at` is
 * `sent_at` + T_offer, set by the server (AGENTS › Invariant 8 in spirit: the client only counts down).
 */
export const offers = core.table(
  'offers',
  {
    id: id(),
    nominationId: ref('nomination_id')
      .notNull()
      .references(() => nominations.id),
    status: text('status').$type<OfferStatus>().notNull(),
    sentAt: timestamptz('sent_at').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
    respondedAt: timestamptz('responded_at'),
    rowVersion: rowVersion(),
  },
  (t) => [
    unique('offers_nomination_id_key').on(t.nominationId),
    oneOf('offers_status_check', t.status, OFFER_STATES),
    check('offers_expires_check', sql`${t.expiresAt} > ${t.sentAt}`),
    check('offers_responded_check', sql`(${t.status} = 'PENDING') = (${t.respondedAt} is null)`),
    // The expiry sweep reads pending offers by deadline (AC-7).
    index('offers_pending_expires_at_idx').on(t.expiresAt).where(sql`${t.status} = 'PENDING'`),
  ],
);
