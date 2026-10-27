import type { Actor } from './actor.js';

/** One row of core.audit_logs, before insertion. */
export interface AuditEntry {
  actor: Actor;
  /** What happened, e.g. `TRANSITION`; later stories add their own actions. */
  action: string;
  /** Entity type, e.g. `campaign`, `job_description`, `cv`. */
  entity: string;
  entityId: number;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
}

/** Action written by `transitionTo` for every state change (AD-8). */
export const AUDIT_ACTION_TRANSITION = 'TRANSITION';
