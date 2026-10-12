import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { StudentCodeTakenError } from '../../../common/errors/index.js';
import { uniqueViolation } from '../../../db/errors.js';
import { students } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import type { StudentAudience } from '../../campaign/index.js';

export interface NewStudent {
  studentCode: string;
  fullName: string;
  major: string;
  cohort: string;
  gpa: number;
}

/** Owns `core.students`; other modules create students only through this service (Principle 13). */
@Injectable()
export class StudentService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Cohort and major of a student, which decide the campaigns they take part in (CONTEXT D27). */
  async findAudience(studentId: number): Promise<StudentAudience | null> {
    const [row] = await this.db
      .select({ cohort: students.cohort, major: students.major })
      .from(students)
      .where(eq(students.id, studentId));
    return row ?? null;
  }

  /** Inserts a student inside the caller's transaction, so the account and the student commit together. */
  async createStudent(tx: DbTx, input: NewStudent): Promise<{ id: number }> {
    try {
      const [row] = await tx.insert(students).values(input).returning({ id: students.id });
      if (!row) throw new Error('insert into students returned no row');
      return row;
    } catch (error) {
      if (uniqueViolation(error) === 'students_student_code_unique') throw new StudentCodeTakenError();
      throw error;
    }
  }
}
