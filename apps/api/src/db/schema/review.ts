import { HR_DECISIONS, type HrDecision, HR_REJECT_REASONS, type HrRejectReason } from '@srm/shared';
import { sql } from 'drizzle-orm';
import { check, index, text, unique } from 'drizzle-orm/pg-core';
import { allocationRounds, nominations } from './allocation.js';
import { campaigns } from './campaigns.js';
import { id, oneOf, ref, timestamptz } from './columns.js';
import { core } from './core.js';
import { jobDescriptions } from './job-descriptions.js';
import { users } from './users.js';

/**
 * HR's decision on a nomination (GĐ8, FR-29, BR-12, BR-13, US-5.3, CONTEXT D65), owned by the review
 * module. One per nomination (AC-7, AGENTS › Invariant 11): a second decision fails at the database
 * even if the state check were skipped. A rejection carries a catalogue reason and a note; both are
 * kept to evaluate the models (PRD › Vòng phản hồi). Rows are never updated.
 */
export const hrReviews = core.table(
  'hr_reviews',
  {
    id: id(),
    nominationId: ref('nomination_id')
      .notNull()
      .references(() => nominations.id),
    reviewerId: ref('reviewer_id')
      .notNull()
      .references(() => users.id),
    decision: text('decision').$type<HrDecision>().notNull(),
    reasonCode: text('reason_code').$type<HrRejectReason>(),
    note: text('note'),
    decidedAt: timestamptz('decided_at').notNull(),
  },
  (t) => [
    unique('hr_reviews_nomination_id_key').on(t.nominationId),
    oneOf('hr_reviews_decision_check', t.decision, HR_DECISIONS),
    oneOf('hr_reviews_reason_code_check', t.reasonCode, HR_REJECT_REASONS),
    // BR-12: a rejection has a reason of the catalogue and a note; an invitation has no reason.
    check(
      'hr_reviews_reason_check',
      sql`(${t.decision} = 'REJECT') = (${t.reasonCode} is not null) and (${t.decision} <> 'REJECT' or btrim(coalesce(${t.note}, '')) <> '')`,
    ),
  ],
);

/**
 * HR asks for more candidates for a JD (GĐ8 step 3, US-5.3 AC-9), at most once per published round.
 * US-5.5 reads these when it runs a supplementary round; what "priority" means there is open.
 */
export const supplementRequests = core.table(
  'supplement_requests',
  {
    id: id(),
    campaignId: ref('campaign_id')
      .notNull()
      .references(() => campaigns.id),
    jdId: ref('jd_id')
      .notNull()
      .references(() => jobDescriptions.id),
    roundId: ref('round_id')
      .notNull()
      .references(() => allocationRounds.id),
    requestedBy: ref('requested_by')
      .notNull()
      .references(() => users.id),
    note: text('note').notNull(),
    createdAt: timestamptz('created_at').notNull(),
  },
  (t) => [
    unique('supplement_requests_round_jd_key').on(t.roundId, t.jdId),
    check('supplement_requests_note_check', sql`btrim(${t.note}) <> ''`),
  ],
);

/**
 * The center moves HR's deadline for a JD's nominations of one round (US-5.3 AC-10, CONTEXT D65).
 * Append-only: the latest row of a `(round_id, jd_id)` is the deadline, each one is audited too.
 */
export const reviewDeadlineExtensions = core.table(
  'review_deadline_extensions',
  {
    id: id(),
    roundId: ref('round_id')
      .notNull()
      .references(() => allocationRounds.id),
    jdId: ref('jd_id')
      .notNull()
      .references(() => jobDescriptions.id),
    dueAt: timestamptz('due_at').notNull(),
    reason: text('reason').notNull(),
    extendedBy: ref('extended_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamptz('created_at').notNull(),
  },
  (t) => [
    index('review_deadline_extensions_round_jd_idx').on(t.roundId, t.jdId),
    check('review_deadline_extensions_reason_check', sql`btrim(${t.reason}) <> ''`),
  ],
);
