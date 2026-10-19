import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { users } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';

/** How to reach an account, as the notification module needs it (US-1.7). */
export interface UserContact {
  id: number;
  email: string;
  fullName: string | null;
  isActive: boolean;
}

/**
 * Read-only lookups of accounts for other modules (AGENTS › Invariant 13: they never read
 * `core.users`). The notification module finds recipients and email addresses here.
 */
@Injectable()
export class UserDirectory {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Ids of the active accounts of these students; a student without an account is left out. */
  async userIdsForStudents(studentIds: readonly number[]): Promise<number[]> {
    if (studentIds.length === 0) return [];
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.studentId, [...studentIds]), eq(users.isActive, true)))
      .orderBy(users.id);
    return rows.map((row) => row.id);
  }

  /** Contacts of the accounts that exist among `userIds`, in no particular order. */
  async findContacts(userIds: readonly number[]): Promise<UserContact[]> {
    if (userIds.length === 0) return [];
    return this.db
      .select({ id: users.id, email: users.email, fullName: users.fullName, isActive: users.isActive })
      .from(users)
      .where(inArray(users.id, [...userIds]));
  }
}
