import { sql } from 'drizzle-orm';
import { check, numeric, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns.js';
import { core } from './core.js';

export const students = core.table(
  'students',
  {
    id: id(),
    studentCode: text('student_code').notNull().unique(),
    fullName: text('full_name').notNull(),
    major: text('major'),
    cohort: text('cohort'),
    // 4-point scale, the scale of a JD's min_gpa (US-3.1, CONTEXT D41).
    gpa: numeric('gpa', { precision: 4, scale: 2, mode: 'number' }),
    ...timestamps(),
  },
  (t) => [check('students_gpa_check', sql`${t.gpa} between 0 and 4`)],
);
