// Reusable helpers for lifecycle tests (US-1.2 AC-9). Later stories use them to put a record in any
// state, run a transition and read its audit entry, and race two operations to check the 409 path.
import { Test, type TestingModule, type TestingModuleBuilder } from '@nestjs/testing';
import type { CampaignStatus, CvStatus, JobDescriptionStatus } from '@srm/shared';
import { and, desc, eq } from 'drizzle-orm';
import { RowVersionConflictError } from '../../src/common/errors/domain-error.js';
import {
  StateModule,
  StateTransitionService,
  type TransitionRequest,
  type TransitionResult,
} from '../../src/common/state/index.js';
import { DbModule } from '../../src/db/db.module.js';
import {
  campaignLifecycle,
  cvLifecycle,
  jobDescriptionLifecycle,
  type Lifecycle,
  type LifecycleTable,
} from '../../src/db/lifecycles.js';
import { auditLogs } from '../../src/db/schema/index.js';
import { DRIZZLE } from '../../src/db/tokens.js';
import type { Database } from '../../src/db/types.js';
import { createCampaign, createCv, createJobDescription } from './factories.js';

interface Lifecycles {
  campaign: CampaignStatus;
  jobDescription: JobDescriptionStatus;
  cv: CvStatus;
}

export type LifecycleKind = keyof Lifecycles;

const LIFECYCLES: { [K in LifecycleKind]: Lifecycle<Lifecycles[K]> } = {
  campaign: campaignLifecycle,
  jobDescription: jobDescriptionLifecycle,
  cv: cvLifecycle,
};

/** Inserts a minimal valid row with the given status and row_version; returns its id. */
const CREATE: Record<LifecycleKind, (db: Database, status: string, rowVersion: number) => Promise<{ id: number }>> = {
  campaign: (db, status, rowVersion) => createCampaign(db, { status: status as CampaignStatus, rowVersion }),
  jobDescription: (db, status, rowVersion) =>
    createJobDescription(db, { status: status as JobDescriptionStatus, rowVersion }),
  cv: (db, status, rowVersion) => createCv(db, { status: status as CvStatus, rowVersion }),
};

/** The production lifecycle (table + state machine) for a kind, to build a `transitionTo` request. */
export function lifecycle<K extends LifecycleKind>(kind: K): Lifecycle<Lifecycles[K]> {
  return LIFECYCLES[kind];
}

export interface LifecycleRow<S extends string> {
  id: number;
  status: S;
  rowVersion: number;
}

/**
 * Inserts a record (and its parent rows) directly in `status`, bypassing `transitionTo`.
 * Test setup only: production code must never write `status` outside `transitionTo`.
 */
export async function insertInState<K extends LifecycleKind>(
  db: Database,
  kind: K,
  status: Lifecycles[K],
  rowVersion = 0,
): Promise<LifecycleRow<Lifecycles[K]>> {
  const { id } = await CREATE[kind](db, status, rowVersion);
  return { id, status, rowVersion };
}

/** Current status and row_version of a lifecycle record. */
export async function readState<K extends LifecycleKind>(
  db: Database,
  kind: K,
  id: number,
): Promise<LifecycleRow<Lifecycles[K]>> {
  const table: LifecycleTable = LIFECYCLES[kind].table;
  const [row] = await db
    .select({ id: table.id, status: table.status, rowVersion: table.rowVersion })
    .from(table)
    .where(eq(table.id, id));
  if (!row) throw new Error(`${kind} ${id} not found`);
  return row as LifecycleRow<Lifecycles[K]>;
}

export type AuditRow = typeof auditLogs.$inferSelect;

/** Audit entries of one entity, newest first. */
export function auditEntries(db: Database, entity: string, entityId: number): Promise<AuditRow[]> {
  return db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.entity, entity), eq(auditLogs.entityId, entityId)))
    .orderBy(desc(auditLogs.id));
}

export async function lastAudit(db: Database, entity: string, entityId: number): Promise<AuditRow | undefined> {
  return (await auditEntries(db, entity, entityId))[0];
}

/** Runs a transition, then reads the newest audit entry it wrote. */
export async function transitionAndReadAudit<S extends string>(
  service: StateTransitionService,
  db: Database,
  request: TransitionRequest<S>,
): Promise<{ result: TransitionResult<S>; audit: AuditRow }> {
  const result = await service.transitionTo(request);
  const entity = request.lifecycle.machine.name;
  const audit = await lastAudit(db, entity, request.id);
  if (!audit) throw new Error(`no audit entry for ${entity} ${request.id}`);
  return { result, audit };
}

/** Starts all operations at once and waits for every one of them to settle. */
export function runConcurrently<T>(...operations: Array<() => Promise<T>>): Promise<PromiseSettledResult<T>[]> {
  return Promise.allSettled(operations.map((operation) => operation()));
}

/** Asserts that exactly one operation won and every other one lost with a row_version conflict (409). */
export function expectExactlyOneConflict<T>(results: PromiseSettledResult<T>[]): T {
  const fulfilled = results.filter((r): r is PromiseFulfilledResult<T> => r.status === 'fulfilled');
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  expect(fulfilled).toHaveLength(1);
  expect(rejected).toHaveLength(results.length - 1);
  for (const { reason } of rejected) {
    expect(reason).toBeInstanceOf(RowVersionConflictError);
    expect((reason as RowVersionConflictError).httpStatus).toBe(409);
  }
  return fulfilled[0]!.value;
}

export interface StateTestContext {
  moduleRef: TestingModule;
  service: StateTransitionService;
  db: Database;
  close(): Promise<void>;
}

/**
 * Nest context with the real DbModule, AuditModule and StateModule against the test database.
 * `configure` can override providers, e.g. AuditService to simulate a failing audit insert.
 */
export async function createStateTestingModule(
  configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<StateTestContext> {
  const moduleRef = await configure(Test.createTestingModule({ imports: [DbModule, StateModule] })).compile();
  await moduleRef.init();
  return {
    moduleRef,
    service: moduleRef.get(StateTransitionService),
    db: moduleRef.get<Database>(DRIZZLE),
    close: () => moduleRef.close(),
  };
}
