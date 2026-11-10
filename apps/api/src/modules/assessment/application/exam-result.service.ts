import { Injectable } from '@nestjs/common';
import type { ExamResult } from '@srm/shared';
import type { AuthUser } from '../../../common/auth/index.js';
import { EntityNotFoundError, ExamNotClosedError } from '../../../common/errors/index.js';
import { JdService } from '../../company/index.js';
import { PreferenceGradingService } from '../../matching/index.js';
import { studentIdOf } from '../../student/index.js';
import { EXAM_SESSION_ENTITY } from '../domain/audit-actions.js';
import { resultEssayOf, resultSkillsOf } from '../domain/exam-result.js';
import { ExamGradingRepository } from '../infrastructure/exam-grading.repository.js';
import { ExamSessionsRepository } from '../infrastructure/exam-sessions.repository.js';
import { QuestionBanksRepository } from '../infrastructure/question-banks.repository.js';

/**
 * AC-12: `GET /api/exam-sessions/{id}/result`, the student's own results (FR-22, BR-11, AGENTS ›
 * Invariants 7, 8). Another student's session reads as missing (404). The response is a whitelist:
 * scores, the preference's S_cv and S_final as stored at publication, and each essay's points with the Grader's reasons by
 * criterion number; never the answer key, the rubric's words or the sample answer, and nothing per
 * multiple-choice question, since other students draw the same questions.
 */
@Injectable()
export class ExamResultService {
  constructor(
    private readonly sessions: ExamSessionsRepository,
    private readonly grading: ExamGradingRepository,
    private readonly banks: QuestionBanksRepository,
    private readonly jds: JdService,
    private readonly preferences: PreferenceGradingService,
  ) {}

  async resultOf(user: AuthUser, sessionId: number): Promise<ExamResult> {
    const studentId = studentIdOf(user);
    const session = await this.sessions.findById(sessionId);
    if (!session || session.studentId !== studentId) throw new EntityNotFoundError(EXAM_SESSION_ENTITY, sessionId);
    if (session.status === 'IN_PROGRESS' || session.submittedAt === null) throw new ExamNotClosedError(sessionId);
    const bank = await this.banks.findById(session.bankId);
    if (!bank) throw new Error(`exam session ${sessionId}: question bank ${session.bankId} not found`);
    const [card] = await this.jds.listCardsByIds([bank.jdId]);
    const base = {
      sessionId,
      jdTitle: card?.title ?? `JD #${bank.jdId}`,
      companyName: card?.companyName ?? '',
      submittedAt: session.submittedAt.toISOString(),
    };
    const { resultsPublishedAt, sTest, scoreA, scoreB, skillScores } = session;
    if (resultsPublishedAt === null || sTest === null || scoreA === null || scoreB === null || skillScores === null) {
      return { state: 'GRADING', ...base, scores: null };
    }

    const [questions, answers, preference] = await Promise.all([
      this.grading.paperQuestions(session.questionIds),
      this.grading.answersOf(sessionId),
      this.preferences.findForGrading(studentId, bank.jdId),
    ]);
    const questionOf = new Map(questions.map((question) => [question.id, question]));
    const answerOf = new Map(answers.map((answer) => [answer.questionId, answer]));
    const essays = session.questionIds.flatMap((questionId, index) => {
      const question = questionOf.get(questionId);
      if (question?.type !== 'ESSAY' || !question.rubric) return [];
      const answer = answerOf.get(questionId);
      return [
        resultEssayOf({
          questionId,
          no: index + 1,
          stem: question.stem,
          rubric: question.rubric,
          answer: answer ? { finalScore: answer.finalScore, needsHuman: answer.needsHuman, aiGrading: answer.aiGrading } : null,
        }),
      ];
    });
    return {
      state: 'PUBLISHED',
      ...base,
      scores: {
        publishedAt: resultsPublishedAt.toISOString(),
        sTest,
        partA: scoreA,
        partB: scoreB,
        skills: resultSkillsOf(skillScores),
        preference: preference
          ? {
              preferenceId: preference.id,
              rank: preference.rank,
              sCv: preference.sCv,
              sFinal: preference.sFinal,
              status: preference.status,
            }
          : null,
        essays,
      },
    };
  }
}
