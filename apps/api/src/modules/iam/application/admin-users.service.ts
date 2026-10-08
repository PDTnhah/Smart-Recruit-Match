import { Inject, Injectable } from '@nestjs/common';
import type { CreateUserRequest, ListUsersQuery, UserList, UserSummary } from '@srm/shared';
import { asc, eq } from 'drizzle-orm';
import { EmailTakenError, RoleNotAllowedError } from '../../../common/errors/index.js';
import { uniqueViolation } from '../../../db/errors.js';
import { users } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { StudentService } from '../../student/index.js';
import { hashPassword } from '../domain/password.js';

const SUMMARY_COLUMNS = {
  id: users.id,
  email: users.email,
  fullName: users.fullName,
  role: users.role,
  companyId: users.companyId,
  studentId: users.studentId,
  isActive: users.isActive,
};

/** Account administration by ADMIN (FR-1, US-1.3 AC-7, CONTEXT D25). */
@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly students: StudentService,
  ) {}

  /** Creates a CENTER, ADMIN or STUDENT account. HR accounts come only from invitations (US-1.5). */
  async create(input: CreateUserRequest): Promise<UserSummary> {
    if (input.role === 'HR') {
      throw new RoleNotAllowedError('HR', 'HR accounts are created by invitation only');
    }
    // CreateUserRequestSchema guarantees `student` is present exactly for STUDENT.
    const student = input.student;
    const passwordHash = await hashPassword(input.password);
    try {
      return await this.db.transaction(async (tx) => {
        const studentId = student
          ? (await this.students.createStudent(tx, { ...student, fullName: input.fullName })).id
          : null;
        const [row] = await tx
          .insert(users)
          .values({
            email: input.email,
            passwordHash,
            fullName: input.fullName,
            role: input.role,
            studentId,
          })
          .returning(SUMMARY_COLUMNS);
        if (!row) throw new Error('insert into users returned no row');
        return row;
      });
    } catch (error) {
      if (uniqueViolation(error) === 'users_email_unique') throw new EmailTakenError();
      throw error;
    }
  }

  /** Accounts in ID order. Reads `users` only; student details belong to the student module. */
  async list(query: ListUsersQuery): Promise<UserList> {
    const items = await this.db
      .select(SUMMARY_COLUMNS)
      .from(users)
      .where(query.role ? eq(users.role, query.role) : undefined)
      .orderBy(asc(users.id))
      .limit(query.limit)
      .offset(query.offset);
    return { items };
  }
}
