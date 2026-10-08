import { CV_STATES, type CvStatus } from '@srm/shared';
import { boolean, integer, jsonb, text } from 'drizzle-orm/pg-core';
import { campaigns } from './campaigns.js';
import { id, oneOf, ref, rowVersion, timestamps } from './columns.js';
import { core } from './core.js';
import { students } from './students.js';

// `active` + the BR-01 partial unique index come with US-1.6; the encrypted `pii` column with US-2.4.
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
    fileKey: text('file_key').notNull(),
    profile: jsonb('profile').$type<Record<string, unknown>>(),
    profileMasked: jsonb('profile_masked').$type<Record<string, unknown>>(),
    version: integer('version').notNull().default(1),
    status: text('status').$type<CvStatus>().notNull().default('PENDING_ANALYSIS'),
    hiddenTextFlag: boolean('hidden_text_flag').notNull().default(false),
    rowVersion: rowVersion(),
    ...timestamps(),
  },
  (t) => [oneOf('cvs_status_check', t.status, CV_STATES)],
);
