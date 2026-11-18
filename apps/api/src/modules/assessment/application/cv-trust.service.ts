import { Injectable } from '@nestjs/common';
import type { CvTrustState, CvTrustView } from '@srm/shared';
import { EntityNotFoundError } from '../../../common/errors/index.js';
import { EXAM_SESSION_ENTITY } from '../domain/audit-actions.js';
import { foundQuoteOf } from '../domain/cv-verification.js';
import { type CvVerificationRecord, CvVerificationsRepository } from '../infrastructure/cv-verifications.repository.js';
import { ExamSessionsRepository } from '../infrastructure/exam-sessions.repository.js';

const NONE: CvTrustView = { state: 'NONE', trustScore: null, trustLevel: null, questions: [] };

/**
 * The CV trust index of part D (FR-25, US-4.8 AC-7, CONTEXT D57), for staff only: the route allows
 * CENTER; HR reads it through `getForPreference` in US-5.3, which checks BR-11 there. Students never
 * see it. Reference only: nothing scores it or changes a state with it (AC-6).
 */
@Injectable()
export class CvTrustService {
  constructor(
    private readonly sessions: ExamSessionsRepository,
    private readonly verifications: CvVerificationsRepository,
  ) {}

  /** `GET /api/exam-sessions/{id}/cv-trust`; 404 for a session that does not exist. */
  async getForSession(sessionId: number): Promise<CvTrustView> {
    const session = await this.sessions.findById(sessionId);
    if (!session) throw new EntityNotFoundError(EXAM_SESSION_ENTITY, sessionId);
    return this.viewOf(await this.verifications.findBySession(sessionId));
  }

  /** The preference's part D, NONE when no session took it. The caller checks who may read it. */
  async getForPreference(preferenceId: number): Promise<CvTrustView> {
    const row = await this.verifications.findByPreference(preferenceId);
    return this.viewOf(row?.sessionId === null ? undefined : row);
  }

  private async viewOf(row: CvVerificationRecord | undefined): Promise<CvTrustView> {
    if (!row) return NONE;
    const questions = await this.verifications.questionsOf(row.id);
    return {
      state: stateOf(row),
      trustScore: row.trustX100,
      trustLevel: row.trustLevel,
      questions: questions.map((question) => ({
        no: question.no,
        stem: question.stem,
        claimSection: question.claimRef.section,
        claimLabel: question.claimLabel,
        answer: question.answer,
        verdict: question.evaluation?.verdict ?? null,
        quote: foundQuoteOf(question.evaluation),
        reason: question.evaluation?.reason ?? null,
      })),
    };
  }
}

function stateOf(row: CvVerificationRecord): CvTrustState {
  if (row.evaluationStatus === 'DONE') return 'DONE';
  if (row.evaluationStatus === 'FAILED') return 'FAILED';
  return 'PENDING';
}
