import { Injectable } from '@nestjs/common';
import { StudentCodeTakenError } from '../../../common/errors/index.js';
import { uniqueViolation } from '../../../db/errors.js';
import { students } from '../../../db/schema/index.js';
import type { DbTx } from '../../../db/types.js';

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
