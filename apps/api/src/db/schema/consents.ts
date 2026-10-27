import { sql } from 'drizzle-orm';
import { check, integer, text, unique } from 'drizzle-orm/pg-core';
import { campaigns } from './campaigns.js';
import { id, ref, timestamptz } from './columns.js';
import { core } from './core.js';
import { students } from './students.js';

// A student's consent to one version of the data-processing terms for one campaign (NFR-2,
// US-1.6, CONTEXT D30). `terms_sha256` is the hash of the exact text shown, so the record proves
// what was accepted even after the source changes.
export const consents = core.table(
  'consents',
  {
    id: id(),
    studentId: ref('student_id')
      .notNull()
      .references(() => students.id),
    campaignId: ref('campaign_id')
      .notNull()
      .references(() => campaigns.id),
    termsVersion: integer('terms_version').notNull(),
    termsSha256: text('terms_sha256').notNull(),
    // Set from the API clock (FakeClock in tests), like the campaign deadlines it is compared with.
    acceptedAt: timestamptz('accepted_at').notNull(),
  },
  (t) => [
    unique('consents_student_campaign_terms_key').on(t.studentId, t.campaignId, t.termsVersion),
    check('consents_terms_version_check', sql`${t.termsVersion} > 0`),
    check('consents_terms_sha256_check', sql`${t.termsSha256} ~ '^[0-9a-f]{64}$'`),
  ],
);
