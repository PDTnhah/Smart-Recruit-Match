import { CV_SOURCES, CV_STATES, type CvProfile, type CvSource, type CvStatus } from '@srm/shared';
import { sql } from 'drizzle-orm';
import { boolean, check, customType, integer, jsonb, text, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { campaigns } from './campaigns.js';
import { id, oneOf, ref, rowVersion, timestamps } from './columns.js';
import { core } from './core.js';
import { students } from './students.js';

/** Raw bytes; `cvs.pii` holds `pgp_sym_encrypt` output and is only written and read through SQL. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

// One row per submitted version (US-1.6, CONTEXT D30): a new upload inserts version n + 1 and
// clears `active` on the previous row. US-2.4 adds what the CV Parser returns (CONTEXT D37).
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
    // Competence profile (FR-11); no personal section. `profile_masked` has every personal value of
    // its free text replaced by a token (BR-03) and is all the AI Service reads of it.
    profile: jsonb('profile').$type<CvProfile>(),
    profileMasked: jsonb('profile_masked').$type<CvProfile>(),
    // Personal data (CvPii as JSON), encrypted with pgcrypto under PII_ENCRYPTION_KEY (NFR-3).
    pii: bytea('pii'),
    // The visible CV text with personal data replaced, for the evidence check of US-3.2; null for
    // a scan, which has no text layer.
    maskedText: text('masked_text'),
    // What the CV Parser read and with what (AGENTS › Invariant 12); the code of a failed analysis.
    analysisSource: text('analysis_source').$type<CvSource>(),
    analysisModel: text('analysis_model'),
    analysisPromptVersion: text('analysis_prompt_version'),
    analysisErrorCode: text('analysis_error_code'),
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
    oneOf('cvs_analysis_source_check', t.analysisSource, CV_SOURCES),
    check('cvs_version_check', sql`${t.version} > 0`),
    // Every stored profile names its model and prompt (AGENTS › Invariant 12).
    check('cvs_analysis_model_check', sql`(${t.analysisModel} is null) = (${t.analysisPromptVersion} is null)`),
    // A CV awaiting or past the student's confirmation has its analysis stored (Invariant 11).
    check(
      'cvs_analysed_check',
      sql`${t.status} not in ('PENDING_CONFIRMATION', 'CONFIRMED') or (${t.profile} is not null and ${t.profileMasked} is not null and ${t.pii} is not null and ${t.analysisModel} is not null and ${t.analysisSource} is not null)`,
    ),
    check('cvs_analysis_failed_check', sql`${t.status} <> 'ANALYSIS_FAILED' or ${t.analysisErrorCode} is not null`),
    // BR-01: at most one active CV per student and campaign (AGENTS › Invariant 11).
    uniqueIndex('cvs_student_campaign_active_key')
      .on(t.studentId, t.campaignId)
      .where(sql`${t.active}`),
    unique('cvs_student_campaign_version_key').on(t.studentId, t.campaignId, t.version),
  ],
);
