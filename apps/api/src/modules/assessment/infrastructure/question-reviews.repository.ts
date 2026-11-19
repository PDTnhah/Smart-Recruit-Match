import { Inject, Injectable } from '@nestjs/common';
import type { QuestionReviewVerdict } from '@srm/shared';
import { desc, inArray } from 'drizzle-orm';
import { questionReviews } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';

export type QuestionReviewRecord = typeof questionReviews.$inferSelect;

export interface NewQuestionReview {
  questionId: number;
  bankVersion: number;
  reviewerId: number;
  verdict: QuestionReviewVerdict;
  reason: string | null;
  reviewedAt: Date;
}

/** Drizzle access to `core.question_reviews` (US-4.9), owned by the assessment module. */
@Injectable()
export class QuestionReviewsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async insert(tx: DbTx, values: NewQuestionReview): Promise<QuestionReviewRecord> {
    const [row] = await tx.insert(questionReviews).values(values).returning();
    if (!row) throw new Error('insert into question_reviews returned no row');
    return row;
  }

  /** The latest review of each of these questions, by question id; a question nobody reviewed is absent. */
  async latestOf(questionIds: readonly number[], tx?: DbTx): Promise<Map<number, QuestionReviewRecord>> {
    if (questionIds.length === 0) return new Map();
    const rows = await (tx ?? this.db)
      .selectDistinctOn([questionReviews.questionId])
      .from(questionReviews)
      .where(inArray(questionReviews.questionId, [...questionIds]))
      .orderBy(questionReviews.questionId, desc(questionReviews.reviewedAt), desc(questionReviews.id));
    return new Map(rows.map((row) => [row.questionId, row]));
  }
}
