import { Injectable } from '@nestjs/common';
import { auditLogs } from '../../../db/schema/index.js';
import type { DbTx } from '../../../db/types.js';
import type { AuditEntry } from '../domain/audit-entry.js';

@Injectable()
export class AuditService {
  /**
   * Appends one entry using the caller's transaction, so the entry commits or rolls back together
   * with the change it records (AD-8, BR-10). Entries are never updated or deleted.
   */
  async record(tx: DbTx, entry: AuditEntry): Promise<void> {
    await tx.insert(auditLogs).values({
      actorKind: entry.actor.kind,
      actorId: entry.actor.kind === 'USER' ? entry.actor.userId : null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: entry.before ?? null,
      after: entry.after ?? null,
      reason: entry.reason ?? null,
    });
  }
}
