import { Injectable, Logger } from '@nestjs/common';
import { errorMessage } from '../../../common/errors/index.js';
import type { DbTx } from '../../../db/types.js';
import { gradeMultipleChoice } from '../domain/scoring.js';
import { ExamGradingRepository } from '../infrastructure/exam-grading.repository.js';

/**
 * AC-1 (CONTEXT D53): grades a closed session's multiple-choice answers by code, in the transaction
 * that closes it; `finalizeIfReady` grades again whatever is left before it scores the session.
 * Answers already graded are left alone; no LLM is called.
 */
@Injectable()
export class McqGrader {
  private readonly logger = new Logger(McqGrader.name);

  constructor(private readonly grading: ExamGradingRepository) {}

  /** How many answers it graded now. Throws on an MCQ without its key. */
  async gradeInTx(tx: DbTx, sessionId: number): Promise<number> {
    const rows = await this.grading.ungradedMcq(tx, sessionId);
    if (rows.length === 0) return 0;
    const keys = new Map(
      rows.flatMap((row) => (row.correctOption === null ? [] : [[row.questionId, row.correctOption] as const])),
    );
    const grades = gradeMultipleChoice(rows, keys);
    await this.grading.writeMcqGrades(tx, sessionId, grades);
    return grades.length;
  }

  /**
   * `gradeInTx` in a savepoint of the closing transaction: grading that fails (a question without
   * its key) is logged and left to `finalizeIfReady`, and never keeps the session open, which would
   * hold back the campaign's essays (`hasOpenSessions`).
   */
  async gradeOnClose(tx: DbTx, sessionId: number): Promise<void> {
    try {
      await tx.transaction((savepoint) => this.gradeInTx(savepoint, sessionId));
    } catch (error) {
      this.logger.error(`exam session ${sessionId}: multiple choice not graded on close: ${errorMessage(error)}`);
    }
  }
}
