import { Inject, Injectable } from '@nestjs/common';
import type { CampaignTarget } from '@srm/shared';
import { eq } from 'drizzle-orm';
import { StudentCodeTakenError } from '../../../common/errors/index.js';
import { uniqueViolation } from '../../../db/errors.js';
import { students } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { isInTarget, type StudentAudience } from '../../campaign/index.js';

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

  /**
   * Students in a campaign's target (US-1.7: who is told the campaign opened). Matched in code with
   * the same rule as campaign visibility, not with SQL `lower()`, whose result depends on the
   * database collation (CONTEXT D31).
   */
  async listIdsInTarget(target: CampaignTarget): Promise<number[]> {
    const rows = await this.db
      .select({ id: students.id, cohort: students.cohort, major: students.major })
      .from(students)
      .orderBy(students.id);
    return rows.filter((row) => isInTarget(target, row)).map((row) => row.id);
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
