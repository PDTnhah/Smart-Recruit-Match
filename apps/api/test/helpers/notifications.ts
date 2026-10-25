// Reading notifications in tests (US-1.7). Listeners run after the event, asynchronously, so tests
// poll with `waitFor` instead of sleeping a fixed time.
import { and, asc, eq, inArray } from 'drizzle-orm';
import { notifications } from '../../src/db/schema/index.js';
import type { Database } from '../../src/db/types.js';

export type NotificationRow = typeof notifications.$inferSelect;

const ofUsers = (userIds: number[]) =>
  userIds.length === 1 ? eq(notifications.userId, userIds[0]!) : inArray(notifications.userId, userIds);

/** Every notification row of the users, oldest first. */
export function notificationsOf(db: Database, ...userIds: number[]): Promise<NotificationRow[]> {
  return db.select().from(notifications).where(ofUsers(userIds)).orderBy(asc(notifications.id));
}

/**
 * The users' notification rows of `type`, oldest first. Test files share one database, and some
 * notify every active CENTER account (JD_REQUIREMENTS_VERSIONED, CV_NEEDS_ATTENTION) while other
 * files run, so a test that checks a CENTER user's rows reads only the type it created.
 */
export function notificationsOfType(
  db: Database,
  type: NotificationRow['type'],
  ...userIds: number[]
): Promise<NotificationRow[]> {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.type, type), ofUsers(userIds)))
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
