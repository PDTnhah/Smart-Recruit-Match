import { CV_STATES, type CvStatus } from '@srm/shared';
import { sql } from 'drizzle-orm';
import { boolean, check, integer, jsonb, text, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { campaigns } from './campaigns.js';
import { id, oneOf, ref, rowVersion, timestamps } from './columns.js';
import { core } from './core.js';
import { students } from './students.js';

// One row per submitted version (US-1.6, CONTEXT D30): a new upload inserts version n + 1 and
// clears `active` on the previous row. The encrypted `pii` column comes with US-2.4.
export const cvs = core.table(
  'cvs',
  {
    id: id(),
    studentId: ref('student_id')
      .notNull()
      .references(() => students.id),
    campaignId: ref('campaign_id')
      .notNull()
      .references(() => campaigns.id),
    // Object key in the `cv-files` bucket, and the name the student uploaded it under (display only).
    fileKey: text('file_key').notNull(),
    fileName: text('file_name').notNull(),
    profile: jsonb('profile').$type<Record<string, unknown>>(),
    profileMasked: jsonb('profile_masked').$type<Record<string, unknown>>(),
    version: integer('version').notNull().default(1),
    status: text('status').$type<CvStatus>().notNull().default('PENDING_ANALYSIS'),
    /** The version that counts in its campaign; older versions keep their row and file. */
    active: boolean('active').notNull().default(true),
    hiddenTextFlag: boolean('hidden_text_flag').notNull().default(false),
    rowVersion: rowVersion(),
    ...timestamps(),
  },
  (t) => [
    oneOf('cvs_status_check', t.status, CV_STATES),
    check('cvs_version_check', sql`${t.version} > 0`),
    // BR-01: at most one active CV per student and campaign (AGENTS › Invariant 11).
    uniqueIndex('cvs_student_campaign_active_key')
      .on(t.studentId, t.campaignId)
      .where(sql`${t.active}`),
    unique('cvs_student_campaign_version_key').on(t.studentId, t.campaignId, t.version),
  ],
);
