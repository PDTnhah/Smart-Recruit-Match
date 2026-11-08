import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  EXAM_PARTS,
  type ExamAnswerValue,
  type ExamPaper,
  type ExamSessionStatus,
  type ExamSubmission,
  type MyExamItem,
  type MyExamsResponse,
  type SaveExamAnswersRequest,
  type SaveExamAnswersResult,
} from '@srm/shared';
import { randomInt } from 'node:crypto';
import type { AuthUser } from '../../../common/auth/index.js';
import { Clock } from '../../../common/clock/index.js';
import {
  BankNotLockedError,
  CampaignPhaseMismatchError,
  EntityNotFoundError,
  errorMessage,
  ExamAlreadyTakenError,
  ExamAnswerInvalidError,
  ExamBankIncompleteError,
  ExamClosedError,
  PreferenceNotPendingTestError,
  RowVersionConflictError,
} from '../../../common/errors/index.js';
import { emitSafely } from '../../../common/events/index.js';
import { StateTransitionService } from '../../../common/state/index.js';
import { examSessionLifecycle } from '../../../db/lifecycles.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { type Actor, AuditService, SYSTEM_ACTOR } from '../../audit/index.js';
import { CampaignService } from '../../campaign/index.js';
import { JdService } from '../../company/index.js';
import { PreferenceExamService } from '../../matching/index.js';
import { studentIdOf } from '../../student/index.js';
import { ASSESSMENT_AUDIT_ACTIONS, EXAM_SESSION_ENTITY, QUESTION_BANK_ENTITY } from '../domain/audit-actions.js';
import { drawExam, type ExamDraw, OPTION_CODE_SPACE } from '../domain/draw-exam.js';
import { closingOf, EXAM_SAVE_GRACE_MS, examDeadline } from '../domain/exam-deadline.js';
import { paperQuestionsOf, savedAnswersOf, storedAnswersOf } from '../domain/exam-paper.js';
import { EXAM_SESSION_CLOSED, type ExamSessionClosedEvent } from '../domain/events.js';
import { ExamAnswerStore } from '../infrastructure/exam-answer-store.js';
import { type ExamSessionRecord, ExamSessionsRepository } from '../infrastructure/exam-sessions.repository.js';
import { QuestionBanksRepository } from '../infrastructure/question-banks.repository.js';
import { DrawableBankCache } from './drawable-bank-cache.js';

/** Error entity of a preference, as the matching module names it. */
const PREFERENCE_ENTITY = 'preference';

/** Seeds fit `exam_sessions.seed integer`, and are non-negative (CHECK `exam_sessions_draw_check`). */
const SEED_LIMIT = 2 ** 31;

/** Who closes a session: the student's submit, or the sweep once the deadline and grace passed. */
export type ExamCloser = { kind: 'STUDENT'; userId: number } | { kind: 'SWEEP' };

export interface ClosedExam {
  submission: ExamSubmission;
  /** False when the session was already closed: nothing was written. */
  closedNow: boolean;
}

interface Drawn {
  bankId: number;
  version: number;
  seed: number;
  draw: ExamDraw;
}

/** What a close wrote; null when the session was closed meanwhile. */
type ClosedInTx = { session: ExamSessionRecord; answered: number } | null;

type Opened =
  | { kind: 'CREATED'; session: ExamSessionRecord }
  | { kind: 'EXISTING'; session: ExamSessionRecord }
  /** The bank's version rose (a question retired) between the draw and the lock. */
  | { kind: 'STALE_DRAW'; version: number };

/**
 * The exam room of GĐ5 (FR-20, BR-05, BR-06, NFR-9, NFR-10, US-4.3, CONTEXT D51). A student starts
 * the test of a preference once; the server draws the paper, decides the deadline from `Clock`,
 * keeps the answers in Redis while the session is open and writes them to PostgreSQL when it
 * closes. Preferences are read and locked through PreferenceExamService, campaigns through
 * CampaignService (AGENTS › Invariant 13). Nothing here sends an answer key to a student
 * (Invariant 8).
 */
@Injectable()
export class ExamSessionService {
  private readonly logger = new Logger(ExamSessionService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly clock: Clock,
    private readonly preferences: PreferenceExamService,
    private readonly campaigns: CampaignService,
    private readonly jds: JdService,
    private readonly banks: QuestionBanksRepository,
    private readonly sessions: ExamSessionsRepository,
    private readonly store: ExamAnswerStore,
    private readonly bankCache: DrawableBankCache,
    private readonly transitions: StateTransitionService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * AC-1, AC-4, AC-5: `POST /api/preferences/{id}/exam/start`. A session already open is returned
   * as it is; a closed one is 409 EXAM_ALREADY_TAKEN. The paper is drawn before the transaction
   * (performance budget); the transaction locks the preference, checks the phase and share-locks
   * the bank, in that order (LESSONS §38), then inserts the session under its unique key (BR-06).
   */
  async start(user: AuthUser, preferenceId: number): Promise<ExamPaper> {
    const studentId = studentIdOf(user);
    const preference = await this.preferences.findForStudent(preferenceId, studentId);
    if (!preference) throw new EntityNotFoundError(PREFERENCE_ENTITY, preferenceId);
    const bank = await this.banks.findByJd(preference.jdId);
    const existing = bank && (await this.sessions.findByStudentAndBank(studentId, bank.id));
    if (existing) return this.resume(existing);
    if (preference.status !== 'PENDING_TEST') throw new PreferenceNotPendingTestError(preferenceId, preference.status);
    await this.campaigns.assertPhase(preference.campaignId, ['TESTING']);
    if (!bank || bank.status !== 'LOCKED') throw new BankNotLockedError(bank?.id ?? null, { jdId: preference.jdId });

    let drawn = await this.draw(bank.id, bank.version);
    let opened = await this.open(user, preferenceId, drawn);
    if (opened.kind === 'STALE_DRAW') {
      drawn = await this.draw(bank.id, opened.version);
      opened = await this.open(user, preferenceId, drawn);
      if (opened.kind === 'STALE_DRAW') {
        throw new RowVersionConflictError(QUESTION_BANK_ENTITY, bank.id, drawn.version, opened.version);
      }
    }
    if (opened.kind === 'EXISTING') return this.resume(opened.session);
    // The Redis hash is written after the commit, by paperOf.
    return this.paperOf(opened.session);
  }

  /** AC-7: `GET /api/exam-sessions/{id}`; another student's session is 404 (BR-11). */
  async get(user: AuthUser, sessionId: number): Promise<ExamPaper> {
    return this.paperOf(await this.requireOwn(user, sessionId));
  }

  /**
   * AC-6: `PUT /api/exam-sessions/{id}/answers`. One Lua script in Redis checks the owner, that
   * the session is open, the deadline plus grace by the server's clock and every code, then writes;
   * PostgreSQL is read only when Redis lost the session.
   */
  async saveAnswers(user: AuthUser, sessionId: number, request: SaveExamAnswersRequest): Promise<SaveExamAnswersResult> {
    const studentId = studentIdOf(user);
    const now = this.clock.now();
    let outcome = await this.store.save(sessionId, studentId, now, EXAM_SAVE_GRACE_MS, request.answers);
    if (outcome.kind === 'MISSING') {
      const session = await this.requireOwn(user, sessionId);
      await this.store.create(session, now, { closed: session.status !== 'IN_PROGRESS' });
      outcome = await this.store.save(sessionId, studentId, now, EXAM_SAVE_GRACE_MS, request.answers);
    }
    switch (outcome.kind) {
      case 'OK':
        return { deadlineAt: outcome.deadlineAt.toISOString(), serverNow: now.toISOString() };
      case 'NOT_OWNER':
        throw new EntityNotFoundError(EXAM_SESSION_ENTITY, sessionId);
      case 'CLOSED':
      case 'DEADLINE_PASSED':
        throw new ExamClosedError(sessionId, outcome.kind);
      case 'INVALID':
        throw new ExamAnswerInvalidError(sessionId, outcome.questionIds);
      case 'MISSING':
        throw new Error(`exam session ${sessionId}: missing in Redis right after it was rebuilt`);
    }
  }

  /**
   * AC-8: `POST /api/exam-sessions/{id}/submit`. Sent again, it answers the same. A submit after
   * the deadline and its grace still closes the session, as EXPIRED.
   */
  async submit(user: AuthUser, sessionId: number): Promise<ExamSubmission> {
    const session = await this.requireOwn(user, sessionId);
    return (await this.close(session, { kind: 'STUDENT', userId: user.userId })).submission;
  }

  /**
   * AC-8, AC-9: the one way a session closes. Redis is closed to saves and read first, so no save
   * lands after the snapshot; then, under the session's row lock, the answers that fit the paper go
   * to `exam_answers` and the session moves to SUBMITTED or EXPIRED with `submitted_at` in the same
   * UPDATE (`closingOf`). `exam.session.closed` follows the commit; a failed transaction lets Redis
   * take saves again.
   */
  async close(session: ExamSessionRecord, closer: ExamCloser): Promise<ClosedExam> {
    if (session.status !== 'IN_PROGRESS') return { submission: await this.submissionOf(session), closedNow: false };
    const now = this.clock.now();
    const saved = await this.closeInRedis(session, now);
    let result: ClosedInTx;
    try {
      result = await this.db.transaction((tx) => this.closeInTx(tx, session.id, saved, now, closer));
    } catch (error) {
      await this.reopenIfOpen(session.id);
      throw error;
    }
    if (result === null) {
      const current = await this.sessions.findById(session.id);
      if (!current) throw new EntityNotFoundError(EXAM_SESSION_ENTITY, session.id);
      return { submission: await this.submissionOf(current), closedNow: false };
    }
    const closed = result.session;
    emitSafely(this.events, this.logger, EXAM_SESSION_CLOSED, {
      sessionId: closed.id,
      studentId: closed.studentId,
      bankId: closed.bankId,
      status: closed.status === 'EXPIRED' ? 'EXPIRED' : 'SUBMITTED',
      submittedAt: (closed.submittedAt ?? closed.deadlineAt).toISOString(),
    } satisfies ExamSessionClosedEvent);
    await this.store.expireAfterClose(closed.id).catch((error: unknown) => {
      this.logger.warn(`exam session ${closed.id}: Redis keys not shortened: ${errorMessage(error)}`);
    });
    return { submission: await this.submissionOf(closed, result.answered), closedNow: true };
  }

  /**
   * AC-14: `GET /api/me/exams`, the preferences of the student's latest campaign, NV1 first, with
   * where each test stands and how long the student would have if they started now.
   */
  async overview(user: AuthUser): Promise<MyExamsResponse> {
    const studentId = studentIdOf(user);
    const now = this.clock.now();
    const all = await this.preferences.listForStudent(studentId);
    const campaignId = all[0]?.campaignId;
    if (campaignId === undefined) return { campaign: null, items: [], serverNow: now.toISOString() };
    const preferences = all.filter((preference) => preference.campaignId === campaignId);
    const jdIds = preferences.map((preference) => preference.jdId);
    const [campaign, cards, banks] = await Promise.all([
      this.campaigns.getSettings(campaignId),
      this.jds.listCardsByIds(jdIds),
      this.banks.findByJds(jdIds),
    ]);
    const sessions = await this.sessions.listOfStudent(
      studentId,
      banks.map((bank) => bank.id),
    );
    const cardOf = new Map(cards.map((card) => [card.jdId, card]));
    const bankOf = new Map(banks.map((bank) => [bank.jdId, bank]));
    const sessionOf = new Map(sessions.map((session) => [session.bankId, session]));
    const testingOpen = this.campaigns.isPhaseOpen(campaign, ['TESTING']);
    const testingEnd = campaign.phaseDeadlines.testing_end ?? null;

    const items = preferences.map((preference): MyExamItem => {
      const card = cardOf.get(preference.jdId);
      const bank = bankOf.get(preference.jdId);
      const locked = bank?.status === 'LOCKED' ? bank : undefined;
      const session = bank ? sessionOf.get(bank.id) : undefined;
      const examStatus = session?.status ?? (preference.status === 'PENDING_TEST' ? 'NOT_STARTED' : 'CLOSED');
      const durationMinutes = locked?.blueprint.duration_minutes ?? null;
      const canStart = examStatus === 'NOT_STARTED' && testingOpen && durationMinutes !== null;
      const secondsIfStartedNow =
        canStart && durationMinutes !== null
          ? Math.floor(
              (examDeadline(now, durationMinutes, testingEnd === null ? null : new Date(testingEnd)).getTime() -
                now.getTime()) /
                1000,
            )
          : null;
      return {
        preferenceId: preference.id,
        rank: preference.rank,
        jdId: preference.jdId,
        jdTitle: card?.title ?? `JD #${preference.jdId}`,
        companyName: card?.companyName ?? '',
        examStatus,
        sessionId: session?.id ?? null,
        durationMinutes,
        questionCount: locked ? EXAM_PARTS.reduce((sum, part) => sum + locked.blueprint.parts[part].question_count, 0) : null,
        deadlineAt: session?.deadlineAt.toISOString() ?? null,
        submittedAt: session?.submittedAt?.toISOString() ?? null,
        canStart,
        secondsIfStartedNow,
      };
    });
    return {
      campaign: { id: campaign.id, name: campaign.name, testingEnd, testingOpen },
      items,
      serverNow: now.toISOString(),
    };
  }

  /** Under the session's row lock; one closed meanwhile is left as it is. */
  private async closeInTx(
    tx: DbTx,
    sessionId: number,
    saved: ReadonlyMap<number, ExamAnswerValue>,
    now: Date,
    closer: ExamCloser,
  ): Promise<ClosedInTx> {
    const locked = await this.sessions.lock(tx, sessionId);
    if (!locked) throw new EntityNotFoundError(EXAM_SESSION_ENTITY, sessionId);
    if (locked.status !== 'IN_PROGRESS') return null;
    const rows = storedAnswersOf(locked.questionIds, locked.optionLayout, saved);
    await this.sessions.insertAnswers(tx, locked.id, rows);
    const closing = closingOf(now, locked.deadlineAt, closer.kind);
    const actor: Actor = closer.kind === 'STUDENT' ? { kind: 'USER', userId: closer.userId } : SYSTEM_ACTOR;
    const moved = await this.transitions.transitionTo<ExamSessionStatus>({
      lifecycle: examSessionLifecycle,
      id: locked.id,
      to: closing.status,
      actor,
      reason: closeReason(closer, closing.status),
      expectedRowVersion: locked.rowVersion,
      set: { submittedAt: closing.submittedAt },
      tx,
    });
    return {
      session: { ...locked, status: closing.status, submittedAt: closing.submittedAt, rowVersion: moved.rowVersion },
      answered: rows.length,
    };
  }

  /**
   * Closes the session to saves in Redis and returns what it holds. When Redis lost the session
   * (CONTEXT D51) the answers are gone and the session is marked closed; if another request rebuilt
   * it open meanwhile, that one is closed and read instead.
   */
  private async closeInRedis(session: ExamSessionRecord, now: Date): Promise<Map<number, ExamAnswerValue>> {
    const answers = await this.store.closeAndRead(session.id);
    if (answers !== null) return answers;
    if (!(await this.store.create(session, now, { closed: true }))) {
      const rebuilt = await this.store.closeAndRead(session.id);
      if (rebuilt !== null) return rebuilt;
    }
    this.logger.warn(`exam session ${session.id}: not in Redis when it closed; closing without its answers`);
    return new Map();
  }

  /**
   * The close transaction failed: the session is still open in PostgreSQL, so Redis takes its saves
   * again. One that another close committed meanwhile stays closed.
   */
  private async reopenIfOpen(sessionId: number): Promise<void> {
    try {
      const current = await this.sessions.findById(sessionId);
      if (current?.status === 'IN_PROGRESS') await this.store.reopen(sessionId);
    } catch (error) {
      this.logger.error(`exam session ${sessionId}: close failed and Redis not reopened: ${errorMessage(error)}`);
    }
  }

  /** The paper of the bank version at hand; a cell the bank cannot fill is 409 EXAM_BANK_INCOMPLETE. */
  private async draw(bankId: number, version: number): Promise<Drawn> {
    const bank = await this.bankCache.get(bankId, version);
    const seed = randomInt(0, SEED_LIMIT);
    // Option codes reach the student: they come from crypto, never from the seed's stream (AC-3).
    const codes = () => randomInt(0, OPTION_CODE_SPACE);
    const result = drawExam({ questions: bank.candidates, blueprint: bank.blueprint, seed, codes });
    if (!result.ok) throw new ExamBankIncompleteError(bankId, result.shortCells);
    return { bankId, version: bank.version, seed, draw: result.draw };
  }

  private async open(user: AuthUser, preferenceId: number, drawn: Drawn): Promise<Opened> {
    const studentId = studentIdOf(user);
    return this.db.transaction(async (tx): Promise<Opened> => {
      const preference = await this.preferences.lockForExam(preferenceId, studentId, { tx });
      if (!preference) throw new EntityNotFoundError(PREFERENCE_ENTITY, preferenceId);
      if (preference.status !== 'PENDING_TEST') throw new PreferenceNotPendingTestError(preferenceId, preference.status);
      const campaign = await this.campaigns.assertPhase(preference.campaignId, ['TESTING'], { tx });
      const bank = await this.banks.findByJdForShare(tx, preference.jdId);
      if (!bank || bank.status !== 'LOCKED') throw new BankNotLockedError(bank?.id ?? null, { jdId: preference.jdId });
      // A start that raced this one and won: the preference lock made it commit first.
      const existing = await this.sessions.findByStudentAndBank(studentId, bank.id, tx);
      if (existing) return { kind: 'EXISTING', session: existing };
      if (bank.id !== drawn.bankId || bank.version !== drawn.version) return { kind: 'STALE_DRAW', version: bank.version };

      const now = this.clock.now();
      const testingEnd = campaign.phaseDeadlines.testing_end;
      // assertPhase read the clock a moment earlier; the deadline must still come after `now`.
      if (testingEnd !== undefined && Date.parse(testingEnd) <= now.getTime()) {
        throw new CampaignPhaseMismatchError(campaign.id, campaign.status, ['TESTING'], testingEnd);
      }
      const deadlineAt = examDeadline(now, drawn.draw.durationMinutes, testingEnd === undefined ? null : new Date(testingEnd));
      const session = await this.sessions.insert(tx, {
        studentId,
        bankId: bank.id,
        bankVersion: bank.version,
        seed: drawn.seed,
        questionIds: drawn.draw.questionIds,
        optionLayout: drawn.draw.optionLayout,
        startedAt: now,
        deadlineAt,
      });
      if (!session) return this.raced(tx, studentId, bank.id);
      await this.audit.record(tx, {
        actor: { kind: 'USER', userId: user.userId },
        action: ASSESSMENT_AUDIT_ACTIONS.EXAM_SESSION_STARTED,
        entity: EXAM_SESSION_ENTITY,
        entityId: session.id,
        after: {
          preferenceId,
          bankId: bank.id,
          bankVersion: bank.version,
          seed: drawn.seed,
          deadlineAt: deadlineAt.toISOString(),
        },
      });
      return { kind: 'CREATED', session };
    });
  }

  /** The unique key refused the insert: the session another request wrote is the student's one. */
  private async raced(tx: DbTx, studentId: number, bankId: number): Promise<Opened> {
    const session = await this.sessions.findByStudentAndBank(studentId, bankId, tx);
    if (!session) throw new Error(`exam session of student ${studentId}, bank ${bankId}: insert refused, none found`);
    return { kind: 'EXISTING', session };
  }

  private async resume(session: ExamSessionRecord): Promise<ExamPaper> {
    if (session.status !== 'IN_PROGRESS') throw new ExamAlreadyTakenError(session.id, session.status);
    return this.paperOf(session);
  }

  private async requireOwn(user: AuthUser, sessionId: number): Promise<ExamSessionRecord> {
    const studentId = studentIdOf(user);
    const session = await this.sessions.findById(sessionId);
    if (!session || session.studentId !== studentId) throw new EntityNotFoundError(EXAM_SESSION_ENTITY, sessionId);
    return session;
  }

  /** AC-3, AC-7: whitelisted fields only; a closed session shows no questions. */
  private async paperOf(session: ExamSessionRecord): Promise<ExamPaper> {
    const now = this.clock.now();
    const base = {
      sessionId: session.id,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      deadlineAt: session.deadlineAt.toISOString(),
      submittedAt: session.submittedAt?.toISOString() ?? null,
      serverNow: now.toISOString(),
    };
    if (session.status !== 'IN_PROGRESS') return { ...base, questions: [], answers: [] };
    // Rebuilt first when Redis lost it, so the saves that follow find the session.
    await this.store.create(session, now, { closed: false });
    const [questions, answers] = await Promise.all([this.sessions.displayOf(session.questionIds), this.store.read(session.id)]);
    return {
      ...base,
      questions: paperQuestionsOf(
        session.questionIds,
        session.optionLayout,
        new Map(questions.map((question) => [question.id, question])),
      ),
      answers: savedAnswersOf(session.questionIds, answers),
    };
  }

  private async submissionOf(session: ExamSessionRecord, answered?: number): Promise<ExamSubmission> {
    if (session.status === 'IN_PROGRESS' || session.submittedAt === null) {
      throw new Error(`exam session ${session.id} is not closed`);
    }
    return {
      sessionId: session.id,
      status: session.status,
      submittedAt: session.submittedAt.toISOString(),
      answeredCount: answered ?? (await this.sessions.countAnswers(session.id)),
      questionCount: session.questionIds.length,
    };
  }
}

function closeReason(closer: ExamCloser, status: 'SUBMITTED' | 'EXPIRED'): string {
  if (closer.kind === 'SWEEP') return 'exam deadline passed: closed by the exam sweep';
  return status === 'SUBMITTED' ? 'submitted by the student' : 'submitted after the deadline and its grace';
}
