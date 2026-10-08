import { JOB_DESCRIPTION_STATES, type JobDescriptionStatus } from '@srm/shared';
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
    rawText: text('raw_text'),
    fileKey: text('file_key'),
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
    check('job_descriptions_quota_check', sql`${t.quota} > 0`),
    index('job_descriptions_campaign_id_status_idx').on(t.campaignId, t.status),
    index('job_descriptions_company_id_idx').on(t.companyId),
  ],
);
