import {
  ACTOR_KINDS,
  type ActorKind,
  APPLICATION_STATES,
  type ApplicationStatus,
  type HardFilterFacts,
  type IneligibleReason,
  MATCH_RUN_STATUSES,
  type MatchCodeCriteria,
  type MatchRunStatus,
  type ScvBreakdownRow,
  type StoredMatchAssessment,
} from '@srm/shared';
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, numeric, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { campaigns } from './campaigns.js';
import { id, oneOf, ref, rowVersion, timestamptz, timestamps } from './columns.js';
import { core } from './core.js';
import { cvs } from './cvs.js';
import { jobDescriptions } from './job-descriptions.js';
import { students } from './students.js';
import { users } from './users.js';

/**
 * One row per CV × JD pair, CV and JD version, code rules and prompt (FR-14, US-3.2, CONTEXT D42,
 * D46). A run writes the code part first: the hard filter, then for a pair that passes the verdicts
 * code judges and `skill_fit`. A pair among the top M of its CV waits with `prompt_version` null
 * until the Matching Agent answers; the backend then fills the LLM part and S_cv in the same row.
 * A new CV or JD version, new rules or another prompt make a new row; old rows stay (BR-18).
 */
export const matchResults = core.table(
  'match_results',
  {
    id: id(),
    campaignId: ref('campaign_id')
      .notNull()
      .references(() => campaigns.id),
    studentId: ref('student_id')
      .notNull()
      .references(() => students.id),
    cvId: ref('cv_id')
      .notNull()
      .references(() => cvs.id),
    cvVersion: integer('cv_version').notNull(),
    jdId: ref('jd_id')
      .notNull()
      .references(() => jobDescriptions.id),
    jdVersion: integer('jd_version').notNull(),
    /** Code rules the verdicts rest on, e.g. `matching-rules/v1+language-cefr/v1+soft-skill-signals/v1`. */
    rulesVersion: text('rules_version').notNull(),
    eligible: boolean('eligible').notNull(),
    ineligibleReasons: jsonb('ineligible_reasons').$type<IneligibleReason[]>().notNull().default([]),
    /** What the hard filter and S_cv read about the student, as of the run, so S_cv can be recomputed. */
    facts: jsonb('facts').$type<HardFilterFacts>().notNull(),
    criteria: jsonb('criteria').$type<MatchCodeCriteria>(),
    skillFit: numeric('skill_fit', { precision: 5, scale: 2, mode: 'number' }),
    /** Outside the top M of its CV by skill_fit: never sent to the LLM (AC-6). */
    skippedByPrefilter: boolean('skipped_by_prefilter').notNull().default(false),
    assessment: jsonb('assessment').$type<StoredMatchAssessment>(),
    promptVersion: text('prompt_version'),
    model: text('model'),
    sCv: numeric('s_cv', { precision: 5, scale: 2, mode: 'number' }),
    scvBreakdown: jsonb('scv_breakdown').$type<ScvBreakdownRow[]>(),
    /** The LLM refused the pair twice: staff review it and later runs do not send it again (AC-9). */
    needsReview: boolean('needs_review').notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    // AC-4: one result per pair and versions; a waiting row (prompt null) counts as one too.
    unique('match_results_pair_versions_key')
      .on(t.cvId, t.jdId, t.cvVersion, t.jdVersion, t.rulesVersion, t.promptVersion)
      .nullsNotDistinct(),
    // The shortlist of a JD reads its pairs by S_cv (US-3.3).
    index('match_results_jd_id_s_cv_idx').on(t.jdId, t.sCv.desc().nullsLast()),
    index('match_results_campaign_id_idx').on(t.campaignId),
    check('match_results_versions_check', sql`${t.cvVersion} > 0 and ${t.jdVersion} > 0`),
    // Eligible ⇔ code verdicts and skill_fit and no reason; not eligible ⇔ at least one reason.
    check(
      'match_results_eligible_check',
      sql`${t.eligible} = (${t.criteria} is not null) and ${t.eligible} = (${t.skillFit} is not null) and ${t.eligible} = (jsonb_array_length(${t.ineligibleReasons}) = 0)`,
    ),
    check('match_results_skipped_check', sql`not ${t.skippedByPrefilter} or ${t.eligible}`),
    // The LLM part comes whole, with S_cv (AGENTS › Invariant 12), and only for a pair that was sent.
    check(
      'match_results_llm_part_check',
      sql`(${t.promptVersion} is null) = (${t.model} is null) and (${t.promptVersion} is null) = (${t.assessment} is null) and (${t.promptVersion} is null) = (${t.sCv} is null) and (${t.sCv} is null) = (${t.scvBreakdown} is null)`,
    ),
    check(
      'match_results_llm_sent_check',
      sql`${t.promptVersion} is null or (${t.eligible} and not ${t.skippedByPrefilter})`,
    ),
    check('match_results_needs_review_check', sql`not ${t.needsReview} or (${t.eligible} and ${t.promptVersion} is null)`),
    check('match_results_s_cv_check', sql`${t.sCv} between 0 and 100`),
    check('match_results_skill_fit_check', sql`${t.skillFit} between 0 and 100`),
  ],
);

/**
 * One row per matching run of a campaign (US-3.2 AC-1, AC-13). A technical log like `ai.jobs`, not
 * a business lifecycle: no state machine, the row is closed once by the result of its job. At most
 * one run per campaign is RUNNING, enforced by a partial unique index (AGENTS › Invariant 11).
 */
export const matchRuns = core.table(
  'match_runs',
  {
    id: id(),
    campaignId: ref('campaign_id')
      .notNull()
      .references(() => campaigns.id),
    /** The `ai.match.run` job, chosen with the plan; null when no pair needed the LLM. */
    jobId: uuid('job_id').unique(),
    /** When the broker took the job; null until the API has handed it over. */
    dispatchedAt: timestamptz('dispatched_at'),
    status: text('status').$type<MatchRunStatus>().notNull(),
    actorKind: text('actor_kind').$type<ActorKind>().notNull(),
    actorId: ref('actor_id').references(() => users.id),
    rulesVersion: text('rules_version').notNull(),
    /** Prompt the job was pinned to; null when it took the active one. */
    promptVersion: text('prompt_version'),
    pairsTotal: integer('pairs_total').notNull(),
    pairsIneligible: integer('pairs_ineligible').notNull(),
    pairsSkipped: integer('pairs_skipped').notNull(),
    /** Already scored with these versions and the pinned prompt (AC-4). */
    pairsCached: integer('pairs_cached').notNull(),
    pairsSent: integer('pairs_sent').notNull(),
    pairsScored: integer('pairs_scored').notNull().default(0),
    pairsFailed: integer('pairs_failed').notNull().default(0),
    errorCode: text('error_code'),
    ...timestamps(),
    finishedAt: timestamptz('finished_at'),
  },
  (t) => [
    oneOf('match_runs_status_check', t.status, MATCH_RUN_STATUSES),
    oneOf('match_runs_actor_kind_check', t.actorKind, ACTOR_KINDS),
    // AC-13: a second run of the same campaign is refused while one is running.
    uniqueIndex('match_runs_campaign_running_key')
      .on(t.campaignId)
      .where(sql`${t.status} = 'RUNNING'`),
    index('match_runs_campaign_id_idx').on(t.campaignId),
    check('match_runs_finished_check', sql`(${t.status} = 'RUNNING') = (${t.finishedAt} is null)`),
    check('match_runs_actor_check', sql`(${t.actorKind} = 'USER') = (${t.actorId} is not null)`),
    // The job id is stored with the plan, before the job is sent: even an answer that comes at
    // once finds its run.
    check('match_runs_job_check', sql`(${t.jobId} is null) = (${t.pairsSent} = 0)`),
    check('match_runs_dispatched_check', sql`${t.dispatchedAt} is null or ${t.jobId} is not null`),
    check('match_runs_failed_check', sql`${t.status} <> 'FAILED' or ${t.errorCode} is not null`),
    check(
      'match_runs_counts_check',
      sql`least(${t.pairsTotal}, ${t.pairsIneligible}, ${t.pairsSkipped}, ${t.pairsCached}, ${t.pairsSent}, ${t.pairsScored}, ${t.pairsFailed}) >= 0`,
    ),
  ],
);

/**
 * A student's preferences in a campaign, NV1 = rank 1 (FR-16, BR-04, US-3.3, CONTEXT D47). Each row
 * is also an application: its status follows `applicationMachine` from PENDING_TEST, moved on by
 * EPIC-4 and EPIC-5 with `transitionTo`. During PREFERENCE_SELECTION the student's whole list is
 * replaced at once; N_NV and "from the shortlist" are campaign rules, checked by the service.
 */
export const preferences = core.table(
  'preferences',
  {
    id: id(),
    campaignId: ref('campaign_id')
      .notNull()
      .references(() => campaigns.id),
    studentId: ref('student_id')
      .notNull()
      .references(() => students.id),
    jdId: ref('jd_id')
      .notNull()
      .references(() => jobDescriptions.id),
    rank: integer('rank').notNull(),
    status: text('status').$type<ApplicationStatus>().notNull().default('PENDING_TEST'),
    /**
     * S_final = α·S_cv + β·S_test (0–100), written with TEST_GRADED by `transitionTo` `set`
     * (US-4.4 AC-10, CONTEXT D53); EPIC-5 ranks by it.
     */
    sFinal: numeric('s_final', { precision: 5, scale: 2, mode: 'number' }),
    /**
     * The S_cv (0–100) that S_final was computed from, written with it: the result page shows the
     * two numbers S_final came from, whatever matching scores later (US-4.4, CONTEXT D53).
     */
    sCv: numeric('s_cv', { precision: 5, scale: 2, mode: 'number' }),
    rowVersion: rowVersion(),
    ...timestamps(),
  },
  (t) => [
    // BR-04 (AGENTS › Invariant 11): one JD per rank, and a JD at most once per student. A JD
    // belongs to one campaign, so the second key holds within the campaign too.
    unique('preferences_campaign_student_rank_key').on(t.campaignId, t.studentId, t.rank),
    unique('preferences_student_jd_key').on(t.studentId, t.jdId),
    check('preferences_rank_check', sql`${t.rank} >= 1`),
    oneOf('preferences_status_check', t.status, APPLICATION_STATES),
    // US-3.4 counts the preferences of a JD by status.
    index('preferences_jd_id_status_idx').on(t.jdId, t.status),
    check('preferences_s_final_check', sql`${t.sFinal} between 0 and 100`),
    // Graded ⇔ S_final, for the two states either side of grading (US-4.4 AC-11).
    check(
      'preferences_s_final_status_check',
      sql`(${t.status} <> 'PENDING_TEST' or ${t.sFinal} is null) and (${t.status} <> 'TEST_GRADED' or ${t.sFinal} is not null)`,
    ),
    check('preferences_s_cv_check', sql`${t.sCv} between 0 and 100`),
    check('preferences_s_cv_s_final_check', sql`(${t.sCv} is null) = (${t.sFinal} is null)`),
  ],
);
