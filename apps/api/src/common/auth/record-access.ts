import { eq, type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { EntityNotFoundError } from '../errors/index.js';
import type { AuthUser } from './auth-user.js';

// Record-level access (BR-11, NFR-1, CONTEXT D25). HR sees records of its own company, a student
// sees only their own records, CENTER and ADMIN see everything. A record outside the caller's
// scope answers 404 exactly like a missing one, so callers cannot probe which IDs exist.

/** The scope keys a service projects from the row it already read. */
export interface RecordScope {
  companyId?: number | null;
  studentId?: number | null;
}

export function canAccessRecord(user: AuthUser, record: RecordScope): boolean {
  switch (user.role) {
    case 'CENTER':
    case 'ADMIN':
      return true;
    case 'HR':
      return record.companyId != null && record.companyId === user.companyId;
    case 'STUDENT':
      return record.studentId != null && record.studentId === user.studentId;
  }
}

/**
 * Returns the record when the caller may see it; throws EntityNotFoundError (404) when it is
 * missing or out of scope. Call it on the row the service just read; no extra query.
 */
export function assertRecordAccess<T extends RecordScope>(
  user: AuthUser,
  record: T | undefined,
  entity: string,
  id: number,
): T {
  if (record !== undefined && canAccessRecord(user, record)) return record;
  throw new EntityNotFoundError(entity, id);
}

/** Scope columns of a table, for list and update queries. */
export interface ScopeColumns {
  companyId?: AnyPgColumn;
  studentId?: AnyPgColumn;
}

/**
 * WHERE condition limiting a query to the caller's scope: `undefined` (no filter) for CENTER and
 * ADMIN, `false` when the table has no column for the caller's scope (deny by default).
 */
export function recordScopeWhere(user: AuthUser, columns: ScopeColumns): SQL | undefined {
  switch (user.role) {
    case 'CENTER':
    case 'ADMIN':
      return undefined;
    case 'HR':
      return columns.companyId ? eq(columns.companyId, user.companyId) : sql`false`;
    case 'STUDENT':
      return columns.studentId ? eq(columns.studentId, user.studentId) : sql`false`;
  }
}
