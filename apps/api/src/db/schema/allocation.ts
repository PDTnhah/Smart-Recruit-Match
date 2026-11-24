import {
  ALLOCATION_ROUND_STATES,
  type AllocationRoundStatus,
  NOMINATION_ACTIVE_STATES,
  NOMINATION_STATES,
  type NominationStatus,
} from '@srm/shared';
import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, numeric, text, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { campaigns } from './campaigns.js';
import { id, inList, oneOf, ref, rowVersion, timestamptz, timestamps } from './columns.js';
import { core } from './core.js';
import { jobDescriptions } from './job-descriptions.js';
import { preferences } from './matching.js';
import { students } from './students.js';
import { users } from './users.js';

/**
 * One allocation round of a campaign (FR-26, FR-27, US-5.2, CONTEXT D64), owned by the allocation
 * module. `input_snapshot` and `config_snapshot` are what the engine ran on (BR-17): IDs, student
 * codes and numbers, no personal data. `engine_result` is the engine's own output, before any manual
 * adjustment; `adjustments` lists those adjustments (BR-10), each also in `audit_logs`. A draft run
 * again is overwritten in place, so a campaign has one row per round number.
 */
export const allocationRounds = core.table(
  'allocation_rounds',
  {
    id: id(),
    campaignId: ref('campaign_id')
      .notNull()
      .references(() => campaigns.id),
    roundNo: integer('round_no').notNull(),
    status: text('status').$type<AllocationRoundStatus>().notNull().default('DRAFT'),
    inputSnapshot: jsonb('input_snapshot').$type<Record<string, unknown>>().notNull(),
    configSnapshot: jsonb('config_snapshot').$type<Record<string, unknown>>().notNull(),
    engineResult: jsonb('engine_result').$type<Record<string, unknown>>().notNull(),
    adjustments: jsonb('adjustments').$type<Record<string, unknown>[]>().notNull().default([]),
    ranAt: timestamptz('ran_at').notNull(),
    ranBy: ref('ran_by').references(() => users.id),
    /** Set with PUBLISHED, in the same UPDATE (`transitionTo` `set`). */
    publishedAt: timestamptz('published_at'),
    rowVersion: rowVersion(),
    ...timestamps(),
  },
  (t) => [
    unique('allocation_rounds_campaign_round_key').on(t.campaignId, t.roundNo),
    oneOf('allocation_rounds_status_check', t.status, ALLOCATION_ROUND_STATES),
    check('allocation_rounds_round_no_check', sql`${t.roundNo} >= 1`),
    check('allocation_rounds_published_check', sql`(${t.status} = 'PUBLISHED') = (${t.publishedAt} is not null)`),
  ],
);

/**
 * A student put forward to a JD by a round (US-5.2, CONTEXT D64). Its status follows
 * `nominationMachine`; a draft round's nominations are already NOMINATED, so the partial unique
 * index holds BR-08 from the draft on (AGENTS › Invariant 11). `s_final` and `rank` (position at the
 * JD, 1 = best) are copied from the round's snapshot; `override_reason` is set when the center added
 * or moved it (BR-10).
 */
export const nominations = core.table(
  'nominations',
  {
    id: id(),
    roundId: ref('round_id')
      .notNull()
      .references(() => allocationRounds.id),
    campaignId: ref('campaign_id')
      .notNull()
      .references(() => campaigns.id),
    studentId: ref('student_id')
      .notNull()
      .references(() => students.id),
    jdId: ref('jd_id')
      .notNull()
      .references(() => jobDescriptions.id),
    /** The application this nomination is of (US-5.3 moves both together). */
    preferenceId: ref('preference_id')
      .notNull()
      .references(() => preferences.id),
    sFinal: numeric('s_final', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    rank: integer('rank').notNull(),
    status: text('status').$type<NominationStatus>().notNull().default('NOMINATED'),
    overrideReason: text('override_reason'),
    rowVersion: rowVersion(),
    ...timestamps(),
  },
  (t) => [
    // BR-08: at most one running nomination per student and campaign, at the database.
    uniqueIndex('nominations_active_student_key')
      .on(t.campaignId, t.studentId)
      .where(sql`${t.status} in (${inList(NOMINATION_ACTIVE_STATES)})`),
    unique('nominations_round_student_key').on(t.roundId, t.studentId),
    index('nominations_round_id_jd_id_idx').on(t.roundId, t.jdId),
    index('nominations_jd_id_status_idx').on(t.jdId, t.status),
    oneOf('nominations_status_check', t.status, NOMINATION_STATES),
    check('nominations_s_final_check', sql`${t.sFinal} between 0 and 100`),
    check('nominations_rank_check', sql`${t.rank} >= 1`),
    check('nominations_override_reason_check', sql`${t.overrideReason} is null or length(trim(${t.overrideReason})) > 0`),
  ],
);
