// Each lifecycle table paired with its state machine, defined once so callers of transitionTo
// cannot mix a table with another lifecycle's machine (AD-8).
import {
  type AllocationRoundStatus,
  allocationRoundMachine,
  type ApplicationStatus,
  applicationMachine,
  type CampaignStatus,
  campaignMachine,
  type CvStatus,
  cvMachine,
  type ExamSessionStatus,
  examSessionMachine,
  type InterviewStatus,
  interviewMachine,
  type JobDescriptionStatus,
  jobDescriptionMachine,
  type NominationStatus,
  nominationMachine,
  type OfferStatus,
  offerMachine,
  type QuestionBankStatus,
  questionBankMachine,
  type QuestionStatus,
  questionMachine,
  type SkillStatus,
  skillMachine,
  type StateMachine,
} from '@srm/shared';
import type { ColumnBaseConfig } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import {
  allocationRounds,
  campaigns,
  cvs,
  examSessions,
  interviews,
  jobDescriptions,
  nominations,
  offers,
  preferences,
  questionBanks,
  questions,
  skills,
} from './schema/index.js';

type NumberColumn = PgColumn<ColumnBaseConfig<'number', string>>;
type StringColumn = PgColumn<ColumnBaseConfig<'string', string>>;

/**
 * Shape `transitionTo` needs: bigint `id`, text `status` and the `row_version` optimistic lock.
 * Use this concrete type, not a generic `T extends PgTable` (LESSONS §7).
 */
export type LifecycleTable = PgTable & { id: NumberColumn; status: StringColumn; rowVersion: NumberColumn };

export interface Lifecycle<S extends string> {
  readonly table: LifecycleTable;
  /** Its `name` is also the audit `entity`. */
  readonly machine: StateMachine<S>;
}

export const campaignLifecycle: Lifecycle<CampaignStatus> = { table: campaigns, machine: campaignMachine };

export const jobDescriptionLifecycle: Lifecycle<JobDescriptionStatus> = {
  table: jobDescriptions,
  machine: jobDescriptionMachine,
};

export const cvLifecycle: Lifecycle<CvStatus> = { table: cvs, machine: cvMachine };

export const skillLifecycle: Lifecycle<SkillStatus> = { table: skills, machine: skillMachine };

/** A preference is also the application of its student to its JD (US-3.3, CONTEXT D47). */
export const applicationLifecycle: Lifecycle<ApplicationStatus> = { table: preferences, machine: applicationMachine };

/** A question of a bank: the Validator's verdict, then retirement (US-4.2, CONTEXT D50). */
export const questionLifecycle: Lifecycle<QuestionStatus> = { table: questions, machine: questionMachine };

/** A JD's question bank: CENTER locks it, with `locked_at` set by `transitionTo` `set` (US-4.2). */
export const questionBankLifecycle: Lifecycle<QuestionBankStatus> = { table: questionBanks, machine: questionBankMachine };

/** A student's attempt at a test: submitted or expired, with `submitted_at` set by `transitionTo` `set` (US-4.3). */
export const examSessionLifecycle: Lifecycle<ExamSessionStatus> = { table: examSessions, machine: examSessionMachine };

/** An allocation round: DRAFT → PUBLISHED, with `published_at` set by `transitionTo` `set` (US-5.2). */
export const allocationRoundLifecycle: Lifecycle<AllocationRoundStatus> = {
  table: allocationRounds,
  machine: allocationRoundMachine,
};

/** A nomination of a round; HR review and interviews move it on (US-5.3, US-5.4). */
export const nominationLifecycle: Lifecycle<NominationStatus> = { table: nominations, machine: nominationMachine };

/** The interview of a nomination: the student's answer, HR's new time, HR's result (US-5.4). */
export const interviewLifecycle: Lifecycle<InterviewStatus> = { table: interviews, machine: interviewMachine };

/** The offer of a PASSED nomination: accepted, declined or expired (US-5.4). */
export const offerLifecycle: Lifecycle<OfferStatus> = { table: offers, machine: offerMachine };
