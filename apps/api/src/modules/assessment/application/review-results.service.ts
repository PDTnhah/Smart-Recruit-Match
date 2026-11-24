import { Inject, Injectable } from '@nestjs/common';
import type { CvTrustView, ExamResultSkill, NominationWarningCode } from '@srm/shared';
import { and, eq } from 'drizzle-orm';
import { examSessions, questionBanks } from '../../../db/schema/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { resultSkillsOf } from '../domain/exam-result.js';
import { CvTrustService } from './cv-trust.service.js';

/** A published test of one student for one JD, as HR reads it (US-5.3 AC-2). */
export interface ReviewTestResult {
  submittedAt: Date | null;
  /** The skill map of the radar chart (`skill_scores`), 0–100 per skill. */
  skills: ExamResultSkill[];
  /** Warnings for staff, by code and count (AGENTS › Invariant 8): they never decide anything. */
  warnings: { code: NominationWarningCode; count: number }[];
}

/**
 * What HR review (US-5.3) reads of a nomination's test, so the review module never touches
 * `core.exam_sessions` itself (AGENTS › Invariant 13). Only scores, skills and warnings: no answer,
 * key or rubric ever leaves here (Invariant 8). The caller checks that HR may read the nomination.
 */
@Injectable()
export class ReviewResultsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly trust: CvTrustService,
  ) {}

  /**
   * The student's session for the JD's bank, once its results are published; null otherwise. One
   * bank per JD and one session per student and bank (BR-06), so the pair names one session.
   */
  async testOf(studentId: number, jdId: number): Promise<ReviewTestResult | null> {
    const [row] = await this.db
      .select({
        submittedAt: examSessions.submittedAt,
        skillScores: examSessions.skillScores,
        flags: examSessions.flags,
        resultsPublishedAt: examSessions.resultsPublishedAt,
      })
      .from(examSessions)
      .innerJoin(questionBanks, eq(questionBanks.id, examSessions.bankId))
      .where(and(eq(examSessions.studentId, studentId), eq(questionBanks.jdId, jdId)));
    if (!row?.resultsPublishedAt) return null;
    const counts = new Map<NominationWarningCode, number>();
    for (const flag of row.flags) counts.set(flag.code, (counts.get(flag.code) ?? 0) + 1);
    return {
      submittedAt: row.submittedAt,
      skills: resultSkillsOf(row.skillScores ?? []),
      warnings: [...counts].map(([code, count]) => ({ code, count })),
    };
  }

  /** The CV trust index of part C (US-4.8), NONE without one. */
  cvTrustOf(preferenceId: number): Promise<CvTrustView> {
    return this.trust.getForPreference(preferenceId);
  }
}
