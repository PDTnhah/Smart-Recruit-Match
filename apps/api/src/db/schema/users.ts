import { ROLES, type Role } from '@srm/shared';
import { sql } from 'drizzle-orm';
import { boolean, check, index, text } from 'drizzle-orm/pg-core';
import { id, oneOf, ref, timestamps } from './columns.js';
import { companies } from './companies.js';
import { core } from './core.js';
import { students } from './students.js';

export const users = core.table(
  'users',
  {
    id: id(),
    // Stored lower-cased (CHECK below), so the plain unique constraint is case-insensitive in effect.
    email: text('email').notNull().unique(),
    // Null until an invited HR sets a password (US-1.5).
    passwordHash: text('password_hash'),
    fullName: text('full_name'),
    role: text('role').$type<Role>().notNull(),
    companyId: ref('company_id').references(() => companies.id),
    studentId: ref('student_id')
      .references(() => students.id)
      .unique(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    oneOf('users_role_check', t.role, ROLES),
    check('users_email_lowercase_check', sql`${t.email} = lower(${t.email})`),
    // HR accounts belong to exactly one company and nobody else has one (record-level access, BR-11).
    check('users_hr_company_check', sql`(${t.role} = 'HR') = (${t.companyId} is not null)`),
    check('users_student_link_check', sql`(${t.role} = 'STUDENT') = (${t.studentId} is not null)`),
    index('users_company_id_idx').on(t.companyId),
  ],
);
