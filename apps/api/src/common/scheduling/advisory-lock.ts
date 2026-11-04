import { sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import type { DbTx } from '../../db/types.js';

/**
 * Keys of the PostgreSQL advisory locks held by scheduled jobs (ARCHITECTURE › Tác vụ định kỳ).
 * One key per job, so two jobs never block each other; later jobs append here.
 */
export const ADVISORY_LOCK_KEYS = {
  /** Campaign phase changes by deadline (US-1.4). */
  CAMPAIGN_PHASE: 1_401,
  /** Deadline reminders (US-1.7). */
  DEADLINE_REMINDER: 1_701,
  /**
   * First key of the two-key transaction lock `pg_advisory_xact_lock(1_702, hashtext(userId))` that
   * orders HR invitation emails of one user (US-1.7). PostgreSQL keeps one-key and two-key locks apart.
   */
  HR_INVITATION_EMAIL: 1_702,
  /**
   * Transaction lock `pg_advisory_xact_lock(2_505)` taken by every ADMIN change to the names and
   * aliases of the skill catalogue (US-2.5), so the check that their keys stay distinct cannot race.
   */
  SKILL_CATALOGUE: 2_505,
  /**
   * First key of `pg_advisory_xact_lock(3_303, hashtext(studentId))`, taken by every change to a
   * student's preference list (US-3.3, CONTEXT D47): two saves, or a save and the auto-assignment
   * of Q6, run one after the other, even before the student has a row to lock.
   */
  STUDENT_PREFERENCES: 3_303,
  /** Sweep of Q6 over the campaigns in TESTING (US-3.3). */
  PREFERENCE_AUTO_ASSIGN: 3_304,
} as const;

/**
 * Takes the two-key transaction lock `pg_advisory_xact_lock(key, hashtext(id))`, held until the
 * transaction ends: the writers of one entity (a user, a student) run one after the other.
 * `hashtext` maps the bigint id to int4, so a collision only serializes two entities.
 */
export async function lockEntityInTx(tx: DbTx, key: number, id: number): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${key}, hashtext(${String(id)}))`);
}

export type AdvisoryLockResult<T> = { acquired: true; result: T } | { acquired: false };

/**
 * Runs `fn` while holding a session-level `pg_try_advisory_lock(key)`, so only one API instance
 * runs the job at a time. Another instance holding the lock makes this return
 * `{ acquired: false }` immediately instead of waiting. The lock lives on a dedicated client that
 * is released only after unlocking; `fn` itself queries through the usual pool.
 */
export async function withAdvisoryLock<T>(
  pool: Pool,
  key: number,
  fn: () => Promise<T>,
): Promise<AdvisoryLockResult<T>> {
  const client = await pool.connect();
  // Destroying the connection ends its session, which drops a lock we failed to release.
  let destroy = false;
  try {
    const { rows } = await client.query<{ locked: boolean }>('select pg_try_advisory_lock($1) as locked', [key]);
    if (!rows[0]?.locked) return { acquired: false };
    try {
      return { acquired: true, result: await fn() };
    } finally {
      await client.query('select pg_advisory_unlock($1)', [key]).catch(() => {
        destroy = true;
      });
    }
  } finally {
    client.release(destroy);
  }
}
