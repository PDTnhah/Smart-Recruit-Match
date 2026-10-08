import { ACTOR_KINDS, type ActorKind } from '@srm/shared';
import { sql } from 'drizzle-orm';
import { check, index, jsonb, text } from 'drizzle-orm/pg-core';
import { id, oneOf, ref, timestamptz } from './columns.js';
import { core } from './core.js';

/**
 * Append-only action log (FR-7, BR-10). A trigger in migration 0001 rejects UPDATE, DELETE and
 * TRUNCATE. No foreign key to users, so entries survive retention-driven deletion of accounts.
 */
export const auditLogs = core.table(
  'audit_logs',
  {
    id: id(),
    actorKind: text('actor_kind').$type<ActorKind>().notNull(),
    actorId: ref('actor_id'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: ref('entity_id').notNull(),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    reason: text('reason'),
    at: timestamptz('at').notNull().defaultNow(),
  },
  (t) => [
    oneOf('audit_logs_actor_kind_check', t.actorKind, ACTOR_KINDS),
    check('audit_logs_actor_id_check', sql`(${t.actorKind} = 'USER') = (${t.actorId} is not null)`),
    index('audit_logs_entity_idx').on(t.entity, t.entityId, t.at),
  ],
);
