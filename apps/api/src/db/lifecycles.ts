// Each lifecycle table paired with its state machine, defined once so callers of transitionTo
// cannot mix a table with another lifecycle's machine (AD-8).
import {
  type CampaignStatus,
  campaignMachine,
  type CvStatus,
  cvMachine,
  type JobDescriptionStatus,
  jobDescriptionMachine,
  type StateMachine,
} from '@srm/shared';
import type { ColumnBaseConfig } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { campaigns, cvs, jobDescriptions } from './schema/index.js';

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
