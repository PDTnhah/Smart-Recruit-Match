import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { CampaignStatus } from '@srm/shared';
import type { Pool } from 'pg';
import { Clock } from '../../../common/clock/index.js';
import { loadEnv } from '../../../common/config/env.js';
import { errorMessage, RowVersionConflictError } from '../../../common/errors/index.js';
import { ADVISORY_LOCK_KEYS, withAdvisoryLock } from '../../../common/scheduling/advisory-lock.js';
import { DRIZZLE, PG_POOL } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { type CampaignSettings, CampaignService } from '../../campaign/index.js';
import { JdService } from '../../company/index.js';
import { UserDirectory } from '../../iam/index.js';
import { type ExamPreference, PreferenceExamService } from '../../matching/index.js';
import { DEDUPE_KEYS, NotificationService, type PendingNotifications } from '../../notification/index.js';
import { EXAM_SAVE_GRACE_MS } from '../domain/exam-deadline.js';
import { type ExamSessionRecord, ExamSessionsRepository } from '../infrastructure/exam-sessions.repository.js';
import { QuestionBanksRepository } from '../infrastructure/question-banks.repository.js';
import { ExamSessionService } from './exam-session.service.js';

/** Sessions read per page; a run pages on, so sessions that keep failing never hold the rest back. */
const EXPIRED_PAGE = 200;

/** Phases in which `testing_end` may have passed with preferences still waiting for their test. */
const AFTER_TESTING_PHASES: readonly CampaignStatus[] = ['TESTING', 'ALLOCATION_REVIEW'];

export interface ExamSweepReport {
  /** False when another instance held the advisory lock; nothing was done. */
  acquired: boolean;
  /** Sessions this run closed as EXPIRED. */
  expired: number[];
  /** Preferences this run closed with reason TEST_NOT_TAKEN. */
  notTaken: number[];
}

/**
 * The exam sweep, every minute (US-4.3 AC-9, AC-10, ARCHITECTURE › Tác vụ định kỳ, CONTEXT D51):
 *
 * 1. closes the open sessions whose deadline and grace have passed, as a submit would, but EXPIRED
 *    at `deadline_at`; the client may never come back;
 * 2. once a campaign's `testing_end` has passed, closes each preference still PENDING_TEST without a
 *    session (BR-06), in its own transaction with the student's notice. A preference changed since
 *    it was listed is skipped and seen again next run.
 *
 * Under an advisory lock, so two instances never sweep together; off when SCHEDULER_ENABLED is
 * false (tests call `runOnce()`).
 */
@Injectable()
export class ExamScheduler {
  private readonly logger = new Logger(ExamScheduler.name);
  private readonly enabled = loadEnv().SCHEDULER_ENABLED;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly clock: Clock,
    private readonly exams: ExamSessionService,
    private readonly sessions: ExamSessionsRepository,
    private readonly banks: QuestionBanksRepository,
    private readonly preferences: PreferenceExamService,
    private readonly campaigns: CampaignService,
    private readonly jds: JdService,
    private readonly directory: UserDirectory,
    private readonly notifications: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'exam-sweep', waitForCompletion: true })
  async tick(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(`exam sweep failed: ${errorMessage(error)}`);
    }
  }

  async runOnce(): Promise<ExamSweepReport> {
    const run = await withAdvisoryLock(this.pool, ADVISORY_LOCK_KEYS.EXAM_SWEEP, async () => ({
      expired: await this.closeExpired(),
      notTaken: await this.closeUntaken(),
    }));
    return run.acquired ? { acquired: true, ...run.result } : { acquired: false, expired: [], notTaken: [] };
  }

  /** AC-9: one session failing does not stop the others. */
  private async closeExpired(): Promise<number[]> {
    const cutoff = new Date(this.clock.now().getTime() - EXAM_SAVE_GRACE_MS);
    const closed: number[] = [];
    let after: ExamSessionRecord | undefined;
    for (;;) {
      const page = await this.sessions.listOpenDueBy(cutoff, EXPIRED_PAGE, after);
      for (const session of page) {
        try {
          if ((await this.exams.close(session, { kind: 'SWEEP' })).closedNow) closed.push(session.id);
        } catch (error) {
          this.logger.error(`exam session ${session.id}: not closed by the sweep: ${errorMessage(error)}`);
        }
      }
      if (page.length < EXPIRED_PAGE) return closed;
      after = page.at(-1);
    }
  }

  /** AC-10, for every campaign past `testing_end`. */
  private async closeUntaken(): Promise<number[]> {
    const now = this.clock.now().getTime();
    const closed: number[] = [];
    for (const status of AFTER_TESTING_PHASES) {
      for (const campaign of await this.campaigns.listSettingsInPhase(status)) {
        const testingEnd = campaign.phaseDeadlines.testing_end;
        if (testingEnd === undefined || Date.parse(testingEnd) > now) continue;
        try {
          closed.push(...(await this.closeUntakenOf(campaign)));
        } catch (error) {
          // One broken campaign must not stop the others.
          this.logger.error(`campaign ${campaign.id}: untaken tests not closed: ${errorMessage(error)}`);
        }
      }
    }
    return closed;
  }

  private async closeUntakenOf(campaign: CampaignSettings): Promise<number[]> {
    const pending = await this.untakenOf(campaign.id);
    if (pending.length === 0) return [];
    const [cards, userIds] = await Promise.all([
      this.jds.listCardsByIds([...new Set(pending.map((preference) => preference.jdId))]),
      this.directory.userIdsByStudent([...new Set(pending.map((preference) => preference.studentId))]),
    ]);
    const cardOf = new Map(cards.map((card) => [card.jdId, card]));
    const closed: number[] = [];
    for (const preference of pending) {
      try {
        const card = cardOf.get(preference.jdId);
        const notice = {
          campaign,
          userIds: userIds.get(preference.studentId) ?? [],
          jdTitle: card?.title ?? `JD #${preference.jdId}`,
          companyName: card?.companyName ?? '—',
        };
        const outcome = await this.closeOne(preference, notice);
        if (outcome === null) continue;
        closed.push(preference.id);
        if (outcome.pending) await this.notifications.push(outcome.pending);
      } catch (error) {
        if (error instanceof RowVersionConflictError) {
          this.logger.log(`preference ${preference.id}: changed since listed; the next sweep sees it again`);
          continue;
        }
        this.logger.error(`preference ${preference.id}: not closed as TEST_NOT_TAKEN: ${errorMessage(error)}`);
      }
    }
    return closed;
  }

  /**
   * The PENDING_TEST preferences of the campaign without a session. One with a session stays
   * PENDING_TEST until US-4.4 grades it, so it is left out here, not locked every minute.
   */
  private async untakenOf(campaignId: number): Promise<ExamPreference[]> {
    const listed = await this.preferences.listPendingTest(campaignId);
    if (listed.length === 0) return [];
    const pairs = await this.sessions.listSessionPairs(
      [...new Set(listed.map((preference) => preference.studentId))],
      [...new Set(listed.map((preference) => preference.jdId))],
    );
    const taken = new Set(pairs.map((pair) => pairKey(pair.studentId, pair.jdId)));
    return listed.filter((preference) => !taken.has(pairKey(preference.studentId, preference.jdId)));
  }

  /**
   * Null when the preference no longer waits for its test, or has a session (US-4.4 grades it). The
   * preference lock orders this with a start, which also asserts the phase and so fails after
   * `testing_end` (LESSONS §38). The row version is the listed one: a change since is a conflict.
   */
  private async closeOne(
    preference: ExamPreference,
    notice: { campaign: CampaignSettings; userIds: number[]; jdTitle: string; companyName: string },
  ): Promise<{ pending: PendingNotifications | null } | null> {
    return this.db.transaction(async (tx) => {
      const locked = await this.preferences.lockForExam(preference.id, preference.studentId, { tx });
      if (!locked || locked.status !== 'PENDING_TEST') return null;
      const bank = await this.banks.findByJd(locked.jdId, tx);
      if (bank && (await this.sessions.findByStudentAndBank(locked.studentId, bank.id, tx))) return null;
      await this.preferences.closeTestNotTaken(locked.id, preference.rowVersion, { tx });
      if (notice.userIds.length === 0) return { pending: null };
      const pending = await this.notifications.notify(
        {
          type: 'EXAM_NOT_TAKEN',
          payload: {
            campaignId: notice.campaign.id,
            campaignName: notice.campaign.name,
            preferenceId: locked.id,
            rank: locked.rank,
            jdTitle: notice.jdTitle,
            companyName: notice.companyName,
          },
          userIds: notice.userIds,
          channels: ['IN_APP', 'EMAIL'],
          dedupeKey: DEDUPE_KEYS.examNotTaken(locked.id),
        },
        { tx },
      );
      return { pending };
    });
  }
}

const pairKey = (studentId: number, jdId: number) => `${studentId}:${jdId}`;
