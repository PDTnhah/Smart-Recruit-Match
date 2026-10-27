import { PgDialect } from 'drizzle-orm/pg-core';
import { jobDescriptions } from '../../db/schema/index.js';
import { EntityNotFoundError } from '../errors/index.js';
import type { AuthUser } from './auth-user.js';
import { assertRecordAccess, canAccessRecord, recordScopeWhere } from './record-access.js';

const center: AuthUser = { userId: 1, role: 'CENTER' };
const admin: AuthUser = { userId: 2, role: 'ADMIN' };
const hrA: AuthUser = { userId: 3, role: 'HR', companyId: 10 };
const studentX: AuthUser = { userId: 4, role: 'STUDENT', studentId: 20 };

describe('BR-11: record-level access', () => {
  it('BR-11: HR sees only records of its own company', () => {
    expect(canAccessRecord(hrA, { companyId: 10 })).toBe(true);
    expect(canAccessRecord(hrA, { companyId: 11 })).toBe(false);
    expect(canAccessRecord(hrA, { studentId: 20 })).toBe(false);
  });

  it('NFR-1: a student sees only their own records', () => {
    expect(canAccessRecord(studentX, { studentId: 20 })).toBe(true);
    expect(canAccessRecord(studentX, { studentId: 21 })).toBe(false);
    expect(canAccessRecord(studentX, { companyId: 10 })).toBe(false);
  });

  it('CENTER and ADMIN see every record', () => {
    for (const user of [center, admin]) {
      expect(canAccessRecord(user, { companyId: 10 })).toBe(true);
      expect(canAccessRecord(user, {})).toBe(true);
    }
  });

  it('denies HR and STUDENT on a record without a scope key', () => {
    expect(canAccessRecord(hrA, { companyId: null })).toBe(false);
    expect(canAccessRecord(studentX, {})).toBe(false);
  });

  it('NFR-1: out-of-scope and missing records both raise the same 404', () => {
    const record = { id: 5, companyId: 10 };
    expect(assertRecordAccess(hrA, record, 'job_description', 5)).toBe(record);

    const outOfScope = () => assertRecordAccess({ ...hrA, companyId: 11 }, record, 'job_description', 5);
    const missing = () => assertRecordAccess(hrA, undefined, 'job_description', 5);
    for (const call of [outOfScope, missing]) {
      expect(call).toThrow(EntityNotFoundError);
      expect(call).toThrow('job_description 5 not found');
    }
  });
});

describe('BR-11: scope filter for list queries', () => {
  const dialect = new PgDialect();
  const render = (user: AuthUser, columns: Parameters<typeof recordScopeWhere>[1]) => {
    const where = recordScopeWhere(user, columns);
    if (where === undefined) return undefined;
    const { sql, params } = dialect.sqlToQuery(where);
    return { sql, params };
  };

  it('filters HR by company and adds nothing for CENTER/ADMIN', () => {
    expect(render(hrA, { companyId: jobDescriptions.companyId })).toEqual({
      sql: '"core"."job_descriptions"."company_id" = $1',
      params: [10],
    });
    expect(render(center, { companyId: jobDescriptions.companyId })).toBeUndefined();
    expect(render(admin, {})).toBeUndefined();
  });

  it('matches nothing when the table has no column for the caller scope', () => {
    expect(render(studentX, { companyId: jobDescriptions.companyId })).toEqual({ sql: 'false', params: [] });
  });
});
