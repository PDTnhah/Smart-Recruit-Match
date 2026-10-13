import { JOB_DESCRIPTION_STATES, type JobDescriptionStatus, WORK_MODES, type WorkMode } from '@srm/shared';
import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, text } from 'drizzle-orm/pg-core';
import { campaigns } from './campaigns.js';
import { id, oneOf, ref, rowVersion, timestamps } from './columns.js';
import { companies } from './companies.js';
import { core } from './core.js';

export const jobDescriptions = core.table(
  'job_descriptions',
  {
    id: id(),
    campaignId: ref('campaign_id')
      .notNull()
      .references(() => campaigns.id),
    companyId: ref('company_id')
      .notNull()
      .references(() => companies.id),
    title: text('title').notNull(),
    positionGroup: text('position_group'),
    // FR-4 fields (US-1.5, CONTEXT D28). Nullable here; the API requires all but the allowance.
    location: text('location'),
    workMode: text('work_mode').$type<WorkMode>(),
    internshipPeriod: text('internship_period'),
    allowance: text('allowance'),
    rawText: text('raw_text'),
    // Object key in the `jd-files` bucket, and the name the HR uploaded it under (for display only).
    fileKey: text('file_key'),
    fileName: text('file_name'),
    requirements: jsonb('requirements').$type<Record<string, unknown>>(),
    quota: integer('quota').notNull(),
    examBlueprint: jsonb('exam_blueprint').$type<Record<string, unknown>>(),
    version: integer('version').notNull().default(1),
    status: text('status').$type<JobDescriptionStatus>().notNull().default('DRAFT'),
    rowVersion: rowVersion(),
    ...timestamps(),
  },
  (t) => [
    oneOf('job_descriptions_status_check', t.status, JOB_DESCRIPTION_STATES),
    oneOf('job_descriptions_work_mode_check', t.workMode, WORK_MODES),
    check('job_descriptions_quota_check', sql`${t.quota} > 0`),
    // A file key without its name (or the reverse) would show a broken "original file" link.
    check('job_descriptions_file_pair_check', sql`(${t.fileKey} is null) = (${t.fileName} is null)`),
    index('job_descriptions_campaign_id_status_idx').on(t.campaignId, t.status),
    index('job_descriptions_company_id_idx').on(t.companyId),
  ],
);
