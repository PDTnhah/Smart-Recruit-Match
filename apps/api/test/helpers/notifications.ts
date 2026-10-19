// Reading notifications in tests (US-1.7). Listeners run after the event, asynchronously, so tests
// poll with `waitFor` instead of sleeping a fixed time.
import { asc, eq, inArray } from 'drizzle-orm';
import { notifications } from '../../src/db/schema/index.js';
import type { Database } from '../../src/db/types.js';

export type NotificationRow = typeof notifications.$inferSelect;

/** Every notification row of the users, oldest first. */
export function notificationsOf(db: Database, ...userIds: number[]): Promise<NotificationRow[]> {
  return db
    .select()
    .from(notifications)
    .where(userIds.length === 1 ? eq(notifications.userId, userIds[0]!) : inArray(notifications.userId, userIds))
    .orderBy(asc(notifications.id));
}

/** Polls `check` until it returns a value that is not undefined, or fails after `timeoutMs`. */
export async function waitFor<T>(check: () => Promise<T | undefined>, timeoutMs = 5_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`condition not met within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
