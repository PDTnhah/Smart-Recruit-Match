import { canTransition, isState } from '@srm/shared';
import { and, eq } from 'drizzle-orm';
import type { Lifecycle } from '../../db/lifecycles.js';
import type { Database, DbTx } from '../../db/types.js';
import { type Actor, AUDIT_ACTION_TRANSITION, type AuditService } from '../../modules/audit/index.js';
import {
  EntityNotFoundError,
  InvalidTransitionError,
  RowVersionConflictError,
  TransitionConditionFailedError,
} from '../errors/domain-error.js';

/** The row as locked by `SELECT … FOR UPDATE`, handed to the guard. */
export interface LockedRow<S extends string> {
  id: number;
  status: S;
  rowVersion: number;
}

export type GuardResult = { ok: true } | { ok: false; reasonCode: string; message?: string };

/** Business condition checked after the row is locked, inside the same transaction. */
export type TransitionGuard<S extends string> = (
  row: LockedRow<S>,
  tx: DbTx,
) => GuardResult | Promise<GuardResult>;

export interface TransitionRequest<S extends string> {
  /** Table + state machine, from src/db/lifecycles.ts (e.g. `campaignLifecycle`). */
  lifecycle: Lifecycle<S>;
  id: number;
  to: S;
  actor: Actor;
  /** Why the change happens; stored in audit_logs.reason. Must not be empty. */
  reason: string;
  /** row_version the caller last read. Required for USER actors; SYSTEM jobs rely on the row lock. */
  expectedRowVersion?: number;
  guard?: TransitionGuard<S>;
  /** Join the caller's transaction instead of opening one (e.g. to write related rows atomically). */
  tx?: DbTx;
}

export interface TransitionResult<S extends string> {
  id: number;
  from: S;
  to: S;
  rowVersion: number;
}

/**
 * The only way to change `status` on a lifecycle table (AD-8, AGENTS › Invariant 10). In one
 * transaction: lock the row, check row_version, check the state table, run the guard, update with
 * `WHERE row_version = n` (updated_at follows via $onUpdate), and append the audit entry. Any
 * failure rolls all of it back.
 */
export async function transitionTo<S extends string>(
  db: Database,
  audit: AuditService,
  request: TransitionRequest<S>,
): Promise<TransitionResult<S>> {
  const { name } = request.lifecycle.machine;
  if (request.reason.trim() === '') {
    throw new Error(`transitionTo(${name}): reason must not be empty`);
  }
  if (request.actor.kind === 'USER' && request.expectedRowVersion === undefined) {
    throw new Error(`transitionTo(${name}): expectedRowVersion is required for USER actors`);
  }
  if (request.tx) return apply(request.tx, audit, request);
  return db.transaction((tx) => apply(tx, audit, request));
}

async function apply<S extends string>(
  tx: DbTx,
  audit: AuditService,
  request: TransitionRequest<S>,
): Promise<TransitionResult<S>> {
  const { id, to } = request;
  const { table, machine } = request.lifecycle;
  const entity = machine.name;

  const rows = await tx
    .select({ id: table.id, status: table.status, rowVersion: table.rowVersion })
    .from(table)
    .where(eq(table.id, id))
    .for('update');
  // The columns are only known structurally, so Drizzle types their values as unknown.
  const locked = rows[0] as { id: number; status: string; rowVersion: number } | undefined;
  if (!locked) throw new EntityNotFoundError(entity, id);

  // Version first: a request that lost a race must get 409, even though the state has moved on.
  if (request.expectedRowVersion !== undefined && locked.rowVersion !== request.expectedRowVersion) {
    throw new RowVersionConflictError(entity, id, request.expectedRowVersion, locked.rowVersion);
  }

  const from = locked.status;
  if (!isState(machine, from) || !canTransition(machine, from, to)) {
    throw new InvalidTransitionError(entity, from, to);
  }

  if (request.guard) {
    const verdict = await request.guard({ id, status: from, rowVersion: locked.rowVersion }, tx);
    if (!verdict.ok) throw new TransitionConditionFailedError(entity, from, to, verdict.reasonCode, verdict.message);
  }

  const rowVersion = locked.rowVersion + 1;
  // Keep `.set({ status:` on one line: the AD-8 boundary check greps for it (US-1.2 › Verification).
  const updated = await tx
    .update(table)
    .set({ status: to, rowVersion })
    .where(and(eq(table.id, id), eq(table.rowVersion, locked.rowVersion)))
    .returning({ id: table.id });
  if (updated.length === 0) throw new RowVersionConflictError(entity, id, locked.rowVersion);

  await audit.record(tx, {
    actor: request.actor,
    action: AUDIT_ACTION_TRANSITION,
    entity,
    entityId: id,
    before: { status: from, rowVersion: locked.rowVersion },
    after: { status: to, rowVersion },
    reason: request.reason,
  });

  return { id, from, to, rowVersion };
}
