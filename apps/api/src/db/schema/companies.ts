import { jsonb, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns.js';
import { core } from './core.js';

export interface CompanyContact {
  name?: string;
  email?: string;
  phone?: string;
}

export const companies = core.table('companies', {
  id: id(),
  name: text('name').notNull(),
  field: text('field'),
  address: text('address'),
  contact: jsonb('contact').$type<CompanyContact>(),
  ...timestamps(),
});
