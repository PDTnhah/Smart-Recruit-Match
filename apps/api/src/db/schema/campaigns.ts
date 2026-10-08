import { CAMPAIGN_STATES, type CampaignStatus } from '@srm/shared';
import { jsonb, text } from 'drizzle-orm/pg-core';
import { id, oneOf, rowVersion, timestamps } from './columns.js';
import { core } from './core.js';

export const campaigns = core.table(
  'campaigns',
  {
    id: id(),
    name: text('name').notNull(),
    status: text('status').$type<CampaignStatus>().notNull().default('DRAFT'),
    phaseDeadlines: jsonb('phase_deadlines').$type<Record<string, string>>().notNull().default({}),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    rowVersion: rowVersion(),
    ...timestamps(),
  },
  (t) => [oneOf('campaigns_status_check', t.status, CAMPAIGN_STATES)],
);
