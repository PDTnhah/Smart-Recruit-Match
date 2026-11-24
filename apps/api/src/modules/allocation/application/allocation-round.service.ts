import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AdjustNominationsRequest,
  type AllocationRoundView,
  type CampaignStatus,
  type JobDescriptionStatus,
  type PublishAllocationRoundRequest,
  type RunAllocationRequest,
  toHundredths,
} from '@srm/shared';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { Clock } from '../../../common/clock/index.js';
import {
  AllocationInProgressError,
  AllocationNotReadyError,
  type AllocationPendingItem,
  AllocationRoundPublishedError,
  AllocationUnstableError,
  EntityNotFoundError,
  errorMessage,
  NominationNotEligibleError,
  NominationOverCapacityError,
  NominationStudentActiveError,
  RowVersionConflictError,
} from '../../../common/errors/index.js';
import { StateTransitionService } from '../../../common/state/index.js';
import { uniqueViolation } from '../../../db/errors.js';
import { allocationRoundLifecycle } from '../../../db/lifecycles.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database, DbTx } from '../../../db/types.js';
import { REDIS } from '../../../redis/redis.module.js';
import { type AllocationSessionResult, AllocationResultsService } from '../../assessment/index.js';
import { type Actor, AuditService } from '../../audit/index.js';
import { CampaignService, type CampaignSettings } from '../../campaign/index.js';
import { JdService } from '../../company/index.js';
import { UserDirectory } from '../../iam/index.js';
import { type AllocationPreference, PreferenceAllocationService } from '../../matching/index.js';
import { DEDUPE_KEYS, NotificationService, type PendingNotifications } from '../../notification/index.js';
import { StudentService } from '../../student/index.js';
import {
  type AllocationInputSnapshot,
  buildConfigSnapshot,
  buildInputSnapshot,
  type CandidatePair,
  canonicalJson,
  checkStability,
  compareRankKeys,
  computeCapacity,
  filterEligible,
  type SnapshotCapacity,
  type SnapshotPair,
  snapshotToEngineInput,
  type StoredEngineResult,
  toCentiScore,
  toStoredResult,
} from '../domain/index.js';
import {
  AllocationRoundRepository,
  type NewNomination,
  type NominationRecord,
  ROUND_ENTITY,
  type RoundRecord,
  type StoredAdjustment,
} from '../infrastructure/allocation-round.repository.js';
import { ALLOCATION_AUDIT_ACTIONS, NOMINATION_ENTITY, ROUND_PUBLISHED_REASON } from './audit-actions.js';
import { ALLOCATION_ENGINE, type AllocationEngine } from './engine.js';
import { AllocationViewService } from './allocation-view.service.js';
import { idsOf } from './round-view.js';
import { SYSTEM_VERSION } from './system-version.js';

/** Rounds run, are adjusted and published while the campaign is in "Phân bổ & HR duyệt" (GĐ7). */
const ALLOCATION_PHASES: readonly CampaignStatus[] = ['ALLOCATION_REVIEW'];

/** This story runs round 1 only; supplementary rounds come with US-5.5. */
const ROUND_NO = 1;

/** Preferences a round reads: graded (ranked when BR-07 holds), below θ_test, closed for a test not taken. */
const CANDIDATE_STATES = new Set(['TEST_GRADED', 'BELOW_THRESHOLD', 'CLOSED']);

/** JDs that still take students; any other has capacity 0 (BR-02). */
const JD_TAKING_STUDENTS: ReadonlySet<JobDescriptionStatus> = new Set(['APPROVED', 'RECRUITING']);

/** `lock:allocation:{campaignId}` (ARCHITECTURE › Redis) lives this long if a run never releases it. */
const LOCK_TTL_MS = 5 * 60_000;

/** Deletes the lock only while it still holds this run's token. */
const RELEASE_SCRIPT = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

const HOUR_MS = 3_600_000;

const pairKey = (studentId: number | string, jdId: number | string) => `${studentId}:${jdId}`;

type LockState = 'ACQUIRED' | 'UNAVAILABLE';

export interface ReplayReport {
  /** The engine gave the stored result again from the snapshot alone (BR-17). */
  matches: boolean;
  original: StoredEngineResult;
  replayed: StoredEngineResult;
}

/**
 * Allocation rounds of GĐ7 (FR-26, FR-27, US-5.2, CONTEXT D64): run the engine of US-5.1 on the
 * campaign's data, keep the snapshot, let the center adjust the draft with a reason, publish. No LLM
 * anywhere (AGENTS › Invariant 2). Data of other modules comes through their exported services
 * (Invariant 13); every write and its audit share one transaction (Invariant 10).
 */
@Injectable()
export class AllocationRoundService {
  private readonly logger = new Logger(AllocationRoundService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ALLOCATION_ENGINE) private readonly engine: AllocationEngine,
    private readonly clock: Clock,
    private readonly repository: AllocationRoundRepository,
    private readonly views: AllocationViewService,
    private readonly campaigns: CampaignService,
    private readonly preferences: PreferenceAllocationService,
    private readonly results: AllocationResultsService,
    private readonly students: StudentService,
    private readonly jds: JdService,
    private readonly users: UserDirectory,
    private readonly notifications: NotificationService,
    private readonly transitions: StateTransitionService,
    private readonly audit: AuditService,
  ) {}

  /**
   * AC-1–AC-6: one run at a time per campaign (Redis lock, then the campaign row `FOR UPDATE`); in
   * one transaction the inputs, BR-07, the engine, `checkStability`, the round and its nominations.
   * A draft run again is replaced, only at the row version the caller saw (AC-11), so a stale page
   * cannot wipe newer adjustments. The lock is released whatever happens.
   */
  async run(campaignId: number, request: RunAllocationRequest, actor: Actor): Promise<AllocationRoundView> {
    const key = `lock:allocation:${campaignId}`;
    const token = randomUUID();
    const lock = await this.acquire(key, token, campaignId);
    try {
      return await this.db.transaction((tx) => this.runInTx(tx, campaignId, request, actor));
    } catch (error) {
      if (error instanceof AllocationUnstableError) {
        this.logger.error(`campaign ${campaignId}: allocation result unstable: ${JSON.stringify(error.details)}`);
      }
      throw error;
    } finally {
      if (lock === 'ACQUIRED') await this.release(key, token);
    }
  }

  /** BR-17 (AC-3): runs the engine again on the stored snapshot alone and compares with the stored result. */
  async replayRound(roundId: number): Promise<ReplayReport> {
    const round = await this.repository.findRound(roundId);
    if (!round) throw new EntityNotFoundError(ROUND_ENTITY, roundId);
    const replayed = toStoredResult(this.engine.allocate(snapshotToEngineInput(round.inputSnapshot)));
    return { matches: canonicalJson(replayed) === canonicalJson(round.engineResult), original: round.engineResult, replayed };
  }

  /**
   * AC-8 (BR-07, BR-08, BR-09, BR-10): applies the operations in order, all or none. Each keeps its
   * reason on the nomination and in `audit_logs`; stability is checked again when the draft is read,
   * as warnings.
   */
  async adjust(roundId: number, request: AdjustNominationsRequest, actor: Actor): Promise<AllocationRoundView> {
    return this.db.transaction(async (tx) => {
      await this.assertRoundPhase(tx, roundId);
      const round = await this.lockDraft(tx, roundId, request.rowVersion);
      const adjustments = await this.applyAdjustments(tx, round, request, actor);
      await this.repository.saveAdjustments(tx, round, [...round.adjustments, ...adjustments]);
      return this.views.view(round.id, tx);
    });
  }

  /**
   * AC-10: in one transaction the round DRAFT → PUBLISHED, each ranked preference NOMINATED or
   * WAITING_NEXT_ROUND, the notices; they reach SSE only after commit. Any failure rolls all back.
   */
  async publish(roundId: number, request: PublishAllocationRoundRequest, actor: Actor): Promise<AllocationRoundView> {
    const { view, pending } = await this.db.transaction(async (tx) => {
      const campaign = await this.assertRoundPhase(tx, roundId);
      const round = await this.lockDraft(tx, roundId, request.rowVersion);
      await this.transitions.transitionTo({
        lifecycle: allocationRoundLifecycle,
        id: round.id,
        to: 'PUBLISHED',
        actor,
        reason: ROUND_PUBLISHED_REASON,
        expectedRowVersion: round.rowVersion,
        set: { publishedAt: this.clock.now() },
        tx,
      });
      const nominations = await this.repository.nominationsOf(round.id, tx);
      const nominated = new Set(nominations.map((nomination) => nomination.preferenceId));
      const ranked = new Set(round.inputSnapshot.pairs.map((pair) => pair.preferenceId));
      const excluded = new Set(round.inputSnapshot.excluded.map((pair) => pairKey(pair.studentId, pair.jdId)));
      for (const preference of await this.preferences.listForAllocation(campaign.id, { tx, lock: 'update' })) {
        const { id, rowVersion } = preference;
        if (nominated.has(id)) {
          await this.preferences.markNominated(id, rowVersion, actor, ROUND_PUBLISHED_REASON, { tx });
        } else if (preference.status !== 'TEST_GRADED') {
          continue;
        } else if (ranked.has(id)) {
          await this.preferences.markWaitingNextRound(id, rowVersion, actor, ROUND_PUBLISHED_REASON, { tx });
        } else if (excluded.has(pairKey(preference.studentId, preference.jdId))) {
          // Graded but kept out by BR-07 (hard filter, θ_cv): no later round can nominate it either.
          await this.preferences.markNotEligible(id, rowVersion, actor, ROUND_PUBLISHED_REASON, { tx });
        }
      }
      const notices = await this.notifyPublished(tx, campaign, round, nominations);
      return { view: await this.views.view(round.id, tx), pending: notices };
    });
    for (const notice of pending) {
      try {
        await this.notifications.push(notice);
      } catch (error) {
        // Stored and committed: the bell shows them on the next load (LESSONS §44).
        this.logger.warn(`round ${roundId}: notices not pushed: ${errorMessage(error)}`);
      }
    }
    return view;
  }

  private async runInTx(
    tx: DbTx,
    campaignId: number,
    request: RunAllocationRequest,
    actor: Actor,
  ): Promise<AllocationRoundView> {
    const campaign = await this.campaigns.assertPhase(campaignId, ALLOCATION_PHASES, { tx, lock: 'update' });
    const existing = await this.repository.findByRoundNo(tx, campaignId, ROUND_NO);
    if (existing?.status === 'PUBLISHED') throw new AllocationRoundPublishedError(campaignId, ROUND_NO);
    if (existing && request.rowVersion !== existing.rowVersion) {
      throw new RowVersionConflictError(ROUND_ENTITY, existing.id, request.rowVersion, existing.rowVersion);
    }

    const preferences = await this.preferences.listForAllocation(campaignId, { tx });
    const sessions = await this.results.listForAllocation(campaignId, { tx });
    const sessionOf = new Map(sessions.map((session) => [pairKey(session.studentId, session.jdId), session]));
    const pending = await this.pendingItems(campaign, preferences, sessionOf);
    if (pending.length > 0) throw new AllocationNotReadyError(campaignId, pending);

    const snapshot = await this.buildSnapshot(campaign, preferences, sessionOf);
    const input = snapshotToEngineInput(snapshot);
    const result = this.engine.allocate(input);
    const report = checkStability(input, result);
    if (!report.ok) throw new AllocationUnstableError(campaignId, report.violations);

    const content = {
      inputSnapshot: snapshot,
      configSnapshot: buildConfigSnapshot({ ...campaign.config }, SYSTEM_VERSION),
      engineResult: toStoredResult(result),
      ranAt: this.clock.now(),
      ranBy: actor.kind === 'USER' ? actor.userId : null,
    };
    let roundId: number;
    if (existing) {
      roundId = existing.id;
      const before = await this.repository.nominationsOf(existing.id, tx);
      await this.repository.deleteNominations(tx, existing.id);
      await this.repository.replaceDraft(tx, existing, content);
      await this.audit.record(tx, {
        actor,
        action: ALLOCATION_AUDIT_ACTIONS.ROUND_RERUN,
        entity: ROUND_ENTITY,
        entityId: roundId,
        before: {
          ranAt: existing.ranAt.toISOString(),
          rowVersion: existing.rowVersion,
          nominations: before.length,
          adjustments: existing.adjustments.length,
        },
        after: { ranAt: content.ranAt.toISOString(), rowVersion: existing.rowVersion + 1, nominations: nominationCount(result.held) },
        reason: 'draft run again',
      });
    } else {
      roundId = await this.repository.insertRound(tx, campaignId, ROUND_NO, content);
      await this.audit.record(tx, {
        actor,
        action: ALLOCATION_AUDIT_ACTIONS.ROUND_RUN,
        entity: ROUND_ENTITY,
        entityId: roundId,
        after: { roundNo: ROUND_NO, ranAt: content.ranAt.toISOString(), nominations: nominationCount(result.held) },
      });
    }
    await this.repository.insertNominations(tx, nominationRows(roundId, campaignId, snapshot, result.held));
    return this.views.view(roundId, tx);
  }

  /**
   * AC-6: a preference whose test has no final score, a session still within its appeal window, an
   * appeal still open (US-4.6 through THRESHOLD_HOLDS), a graded pair with no current match result.
   * Times by `Clock`.
   */
  private async pendingItems(
    campaign: CampaignSettings,
    preferences: readonly AllocationPreference[],
    sessionOf: ReadonlyMap<string, AllocationSessionResult>,
  ): Promise<AllocationPendingItem[]> {
    const now = this.clock.now().getTime();
    const windowMs = campaign.config.appeal_window_hours * HOUR_MS;
    const pending: AllocationPendingItem[] = [];
    const settled: { item: Omit<AllocationPendingItem, 'kind'>; sessionId: number }[] = [];
    for (const preference of preferences) {
      const item = { preferenceId: preference.id, studentId: preference.studentId, jdId: preference.jdId };
      if (preference.status === 'PENDING_TEST') {
        pending.push({ kind: 'TEST_NOT_FINAL', ...item });
        continue;
      }
      if (preference.status !== 'TEST_GRADED') continue;
      // Graded, but no result under the current rules and pinned prompt (rules raised since):
      // its hard filter is unknown, so the pair is neither ranked nor reported as failing it.
      if (!preference.match) {
        pending.push({ kind: 'MATCH_NOT_CURRENT', ...item });
        continue;
      }
      const session = sessionOf.get(pairKey(preference.studentId, preference.jdId));
      if (!session?.resultsPublishedAt || session.sTest === null) {
        pending.push({ kind: 'TEST_NOT_FINAL', ...item });
        continue;
      }
      const until = session.resultsPublishedAt.getTime() + windowMs;
      if (now < until) pending.push({ kind: 'APPEAL_WINDOW_OPEN', ...item, until: new Date(until).toISOString() });
      else settled.push({ item, sessionId: session.sessionId });
    }
    const held = await this.results.heldSessionIds(settled.map((entry) => entry.sessionId));
    for (const entry of settled) if (held.has(entry.sessionId)) pending.push({ kind: 'APPEAL_OPEN', ...entry.item });
    return pending;
  }

  /** BR-07 and BR-17: the round's input, from the campaign's preferences, tests, students and JDs. */
  private async buildSnapshot(
    campaign: CampaignSettings,
    preferences: readonly AllocationPreference[],
    sessionOf: ReadonlyMap<string, AllocationSessionResult>,
  ): Promise<AllocationInputSnapshot> {
    const candidates = preferences.filter((preference) => CANDIDATE_STATES.has(preference.status));
    const candidateOf = new Map(candidates.map((preference) => [pairKey(preference.studentId, preference.jdId), preference]));
    const pairs: CandidatePair[] = candidates.map((preference) => {
      const session = sessionOf.get(pairKey(preference.studentId, preference.jdId));
      const sCv = preference.sCv ?? preference.match?.sCv ?? null;
      const sTest = preference.status === 'CLOSED' ? null : (session?.sTest ?? null);
      return {
        studentId: String(preference.studentId),
        jdId: String(preference.jdId),
        preferenceRank: preference.rank,
        // No current result: a graded pair never gets here (`pendingItems`); for a pair below θ_test
        // or never tested, no verdict is not a failed hard filter, and its other reasons keep it out.
        hardFilter: preference.match
          ? { eligible: preference.match.eligible, codes: preference.match.ineligibleCodes }
          : { eligible: true, codes: [] },
        sCv: sCv === null ? null : toCentiScore(sCv),
        sTest: sTest === null ? null : toCentiScore(sTest),
        sFinal: preference.sFinal === null ? null : toCentiScore(preference.sFinal),
      };
    });
    const { eligible, excluded } = filterEligible(pairs, {
      thetaCv: toHundredths(campaign.config.theta_cv),
      thetaTest: toHundredths(campaign.config.theta_test),
    });

    const students = await this.students.allocationRecords([...new Set(candidates.map((preference) => preference.studentId))]);
    const ranked: SnapshotPair[] = eligible.map((pair) => {
      const key = pairKey(pair.studentId, pair.jdId);
      const preference = candidateOf.get(key);
      const session = sessionOf.get(key);
      const student = students.get(Number(pair.studentId));
      if (
        !preference?.match ||
        !session?.submittedAt ||
        !student ||
        pair.sFinal === null ||
        pair.sTest === null ||
        pair.sCv === null
      ) {
        throw new Error(`pair ${key} is eligible without its preference, match result, test, student or scores`);
      }
      const { match } = preference;
      return {
        studentId: pair.studentId,
        jdId: pair.jdId,
        preferenceRank: pair.preferenceRank,
        preferenceId: preference.id,
        rankKey: {
          demoted: false, // BR-16 starts with supplementary rounds (US-5.4, US-5.5)
          sFinal: pair.sFinal,
          sTest: pair.sTest,
          sCv: pair.sCv,
          gpa: student.gpa4 === null ? null : toCentiScore(student.gpa4),
          submittedAt: session.submittedAt.getTime(),
          studentCode: student.studentCode,
        },
        matching: match?.model && match.promptVersion ? { model: match.model, promptVersion: match.promptVersion } : null,
        grading: session.graders,
      };
    });

    const approved = await this.jds.listApprovedForMatching(campaign.id);
    const jdIds = [...new Set([...candidates.map((preference) => preference.jdId), ...approved.map((jd) => jd.jdId)])];
    const capacity: SnapshotCapacity[] = (await this.jds.listAllocationJds(jdIds)).map((jd) => {
      const components = { quota: jd.quota, accepted: 0, inProcess: 0, k: campaign.config.k };
      return {
        jdId: String(jd.jdId),
        capacity: JD_TAKING_STUDENTS.has(jd.status) ? computeCapacity(components) : 0,
        ...components,
        jdStatus: jd.status,
      };
    });

    return buildInputSnapshot({
      roundNo: ROUND_NO,
      pairs: ranked,
      excluded: excluded.map((pair) => ({
        studentId: pair.studentId,
        jdId: pair.jdId,
        preferenceRank: pair.preferenceRank,
        reasons: pair.reasons,
        hardFilterCodes: pair.hardFilter.codes,
        sCv: pair.sCv,
        sTest: pair.sTest,
        sFinal: pair.sFinal,
      })),
      capacity,
    });
  }

  private async applyAdjustments(
    tx: DbTx,
    round: RoundRecord,
    request: AdjustNominationsRequest,
    actor: Actor,
  ): Promise<StoredAdjustment[]> {
    const snapshot = round.inputSnapshot;
    const pairOf = new Map(snapshot.pairs.map((pair) => [pairKey(pair.studentId, pair.jdId), pair]));
    const excludedOf = new Map(snapshot.excluded.map((pair) => [pairKey(pair.studentId, pair.jdId), pair]));
    const capacityOf = (jdId: number) => snapshot.capacity.find((row) => row.jdId === String(jdId))?.capacity ?? 0;
    const live = new Map((await this.repository.nominationsOf(round.id, tx)).map((nomination) => [nomination.id, nomination]));
    const heldAt = (jdId: number) => [...live.values()].filter((nomination) => nomination.jdId === jdId).length;
    const eligiblePair = (studentId: number, jdId: number): SnapshotPair => {
      const pair = pairOf.get(pairKey(studentId, jdId));
      if (!pair) throw new NominationNotEligibleError(studentId, jdId, excludedOf.get(pairKey(studentId, jdId))?.reasons ?? ['NOT_A_PREFERENCE']);
      return pair;
    };
    const assertSeat = (jdId: number) => {
      if (heldAt(jdId) >= capacityOf(jdId)) throw new NominationOverCapacityError(jdId, capacityOf(jdId));
    };
    const nominationOf = (id: number): NominationRecord => {
      const nomination = live.get(id);
      if (!nomination) throw new EntityNotFoundError(NOMINATION_ENTITY, id);
      return nomination;
    };

    const at = this.clock.now().toISOString();
    const actorId = actor.kind === 'USER' ? actor.userId : null;
    const adjustments: StoredAdjustment[] = [];
    const touched = new Set<number>();
    for (const operation of request.operations) {
      const reason = operation.reason;
      if (operation.op === 'add') {
        const { studentId, jdId } = operation;
        const pair = eligiblePair(studentId, jdId);
        if ([...live.values()].some((nomination) => nomination.studentId === studentId)) {
          throw new NominationStudentActiveError(studentId);
        }
        assertSeat(jdId);
        const row: NewNomination = {
          roundId: round.id,
          campaignId: round.campaignId,
          studentId,
          jdId,
          preferenceId: pair.preferenceId,
          sFinal: pair.rankKey.sFinal / 100,
          rank: heldAt(jdId) + 1,
          overrideReason: reason,
        };
        let id: number;
        try {
          id = await this.repository.insertNomination(tx, row);
        } catch (error) {
          // BR-08 at the database: a running nomination of another round (AC-9).
          if (uniqueViolation(error) === 'nominations_active_student_key') throw new NominationStudentActiveError(studentId);
          throw error;
        }
        live.set(id, { ...row, id, status: 'NOMINATED', rowVersion: 0 });
        await this.recordAdjustment(tx, actor, ALLOCATION_AUDIT_ACTIONS.NOMINATION_ADDED, id, null, { roundId: round.id, studentId, jdId }, reason);
        adjustments.push({ op: 'add', studentId, fromJdId: null, toJdId: jdId, reason, actorId, at });
        touched.add(jdId);
      } else if (operation.op === 'remove') {
        const nomination = nominationOf(operation.nominationId);
        await this.repository.deleteNomination(tx, nomination.id);
        live.delete(nomination.id);
        await this.recordAdjustment(
          tx,
          actor,
          ALLOCATION_AUDIT_ACTIONS.NOMINATION_REMOVED,
          nomination.id,
          { roundId: round.id, studentId: nomination.studentId, jdId: nomination.jdId },
          null,
          reason,
        );
        adjustments.push({ op: 'remove', studentId: nomination.studentId, fromJdId: nomination.jdId, toJdId: null, reason, actorId, at });
        touched.add(nomination.jdId);
      } else {
        const nomination = nominationOf(operation.nominationId);
        const { jdId } = operation;
        if (nomination.jdId === jdId) throw new NominationNotEligibleError(nomination.studentId, jdId, ['ALREADY_AT_JD']);
        const pair = eligiblePair(nomination.studentId, jdId);
        assertSeat(jdId);
        const moved = {
          jdId,
          preferenceId: pair.preferenceId,
          sFinal: pair.rankKey.sFinal / 100,
          rank: heldAt(jdId) + 1,
          overrideReason: reason,
        };
        await this.repository.moveNomination(tx, nomination.id, moved);
        live.set(nomination.id, { ...nomination, ...moved, rowVersion: nomination.rowVersion + 1 });
        await this.recordAdjustment(
          tx,
          actor,
          ALLOCATION_AUDIT_ACTIONS.NOMINATION_MOVED,
          nomination.id,
          { roundId: round.id, studentId: nomination.studentId, jdId: nomination.jdId },
          { roundId: round.id, studentId: nomination.studentId, jdId },
          reason,
        );
        adjustments.push({ op: 'move', studentId: nomination.studentId, fromJdId: nomination.jdId, toJdId: jdId, reason, actorId, at });
        touched.add(nomination.jdId);
        touched.add(jdId);
      }
    }
    await this.rerank(tx, pairOf, [...live.values()], touched);
    return adjustments;
  }

  /** Positions at each changed JD follow the engine's ranking again (rank 1 = best). */
  private async rerank(
    tx: DbTx,
    pairOf: ReadonlyMap<string, SnapshotPair>,
    nominations: readonly NominationRecord[],
    jdIds: ReadonlySet<number>,
  ): Promise<void> {
    const keyOf = (nomination: NominationRecord) => {
      const pair = pairOf.get(pairKey(nomination.studentId, nomination.jdId));
      if (!pair) throw new Error(`nomination ${nomination.id} has no pair in the snapshot`);
      return pair.rankKey;
    };
    for (const jdId of jdIds) {
      const list = nominations.filter((nomination) => nomination.jdId === jdId).sort((a, b) => compareRankKeys(keyOf(a), keyOf(b)));
      for (const [index, nomination] of list.entries()) {
        if (nomination.rank !== index + 1) await this.repository.setRank(tx, nomination.id, index + 1);
      }
    }
  }

  private recordAdjustment(
    tx: DbTx,
    actor: Actor,
    action: string,
    nominationId: number,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    reason: string,
  ): Promise<void> {
    return this.audit.record(tx, { actor, action, entity: NOMINATION_ENTITY, entityId: nominationId, before, after, reason });
  }

  /**
   * The phase check of a round's campaign (`FOR SHARE`), taken before `lockDraft`: campaign first,
   * then round, the order `run` locks them in, so a run and an adjustment or a publish never deadlock.
   */
  private async assertRoundPhase(tx: DbTx, roundId: number): Promise<CampaignSettings> {
    const campaignId = await this.repository.campaignOf(tx, roundId);
    if (campaignId === undefined) throw new EntityNotFoundError(ROUND_ENTITY, roundId);
    return this.campaigns.assertPhase(campaignId, ALLOCATION_PHASES, { tx });
  }

  /** The round locked `FOR UPDATE`, at the version the caller read (AC-11), still a draft (AC-10). */
  private async lockDraft(tx: DbTx, roundId: number, rowVersion: number): Promise<RoundRecord> {
    const round = await this.repository.findRound(roundId, { tx, lock: 'update' });
    if (!round) throw new EntityNotFoundError(ROUND_ENTITY, roundId);
    if (round.rowVersion !== rowVersion) throw new RowVersionConflictError(ROUND_ENTITY, roundId, rowVersion, round.rowVersion);
    if (round.status !== 'DRAFT') throw new AllocationRoundPublishedError(round.campaignId, round.roundNo);
    return round;
  }

  /**
   * GĐ7 step 4 (CONTEXT D64): in the app only. Each student of the round hears where they are
   * nominated, or that they are not; the HR of each JD with nominations hears how many. Written in `tx`.
   */
  private async notifyPublished(
    tx: DbTx,
    campaign: CampaignSettings,
    round: RoundRecord,
    nominations: readonly NominationRecord[],
  ): Promise<PendingNotifications[]> {
    const pending: PendingNotifications[] = [];
    const base = { campaignId: campaign.id, campaignName: campaign.name, roundNo: round.roundNo };
    const jdIdOf = new Map(nominations.map((nomination) => [nomination.studentId, nomination.jdId]));
    const jds = new Map((await this.jds.listAllocationJds([...new Set(nominations.map((n) => n.jdId))])).map((jd) => [jd.jdId, jd]));
    // Every student of the round, also one whose every NV BR-07 kept out (AC-7).
    const accounts = await this.users.userIdsByStudent(idsOf(round.inputSnapshot).studentIds);

    const byJd = new Map<number | null, number[]>();
    for (const [studentId, userIds] of accounts) {
      const jdId = jdIdOf.get(studentId) ?? null;
      byJd.set(jdId, [...(byJd.get(jdId) ?? []), ...userIds]);
    }
    for (const [jdId, userIds] of byJd) {
      const jd = jdId === null ? undefined : jds.get(jdId);
      if (userIds.length === 0 || (jdId !== null && !jd)) continue;
      pending.push(
        await this.notifications.notify(
          {
            type: 'NOMINATIONS_PUBLISHED',
            payload: {
              audience: 'STUDENT',
              ...base,
              jd: jd ? { jdId: jd.jdId, title: jd.title, companyName: jd.companyName } : null,
            },
            userIds,
            channels: ['IN_APP'],
            dedupeKey: DEDUPE_KEYS.nominationsPublished(round.id),
          },
          { tx },
        ),
      );
    }
    for (const jd of jds.values()) {
      const userIds = await this.users.hrUserIdsOfCompany(jd.companyId);
      if (userIds.length === 0) continue;
      pending.push(
        await this.notifications.notify(
          {
            type: 'NOMINATIONS_PUBLISHED',
            payload: {
              audience: 'HR',
              ...base,
              jd: { jdId: jd.jdId, title: jd.title },
              nominationCount: nominations.filter((nomination) => nomination.jdId === jd.jdId).length,
            },
            userIds,
            channels: ['IN_APP'],
            dedupeKey: DEDUPE_KEYS.nominationsPublished(round.id, jd.jdId),
          },
          { tx },
        ),
      );
    }
    return pending;
  }

  /**
   * AC-5: `SET NX PX`. Busy → 409. Redis down → the run goes on: the campaign row `FOR UPDATE`
   * still runs one at a time, and a second run waits, then replaces the draft.
   */
  private async acquire(key: string, token: string, campaignId: number): Promise<LockState> {
    let answer: string | null;
    try {
      answer = await this.redis.set(key, token, 'PX', LOCK_TTL_MS, 'NX');
    } catch (error) {
      this.logger.warn(`campaign ${campaignId}: allocation lock unavailable, relying on the row lock: ${errorMessage(error)}`);
      return 'UNAVAILABLE';
    }
    if (answer !== 'OK') throw new AllocationInProgressError(campaignId);
    return 'ACQUIRED';
  }

  private async release(key: string, token: string): Promise<void> {
    try {
      await this.redis.eval(RELEASE_SCRIPT, 1, key, token);
    } catch (error) {
      this.logger.warn(`${key}: not released, expires in ${LOCK_TTL_MS / 60_000} min: ${errorMessage(error)}`);
    }
  }
}

function nominationCount(held: ReadonlyMap<string, readonly string[]>): number {
  return [...held.values()].reduce((total, list) => total + list.length, 0);
}

function nominationRows(
  roundId: number,
  campaignId: number,
  snapshot: AllocationInputSnapshot,
  held: ReadonlyMap<string, readonly string[]>,
): NewNomination[] {
  const pairOf = new Map(snapshot.pairs.map((pair) => [pairKey(pair.studentId, pair.jdId), pair]));
  return [...held].flatMap(([jdId, students]) =>
    students.map((studentId, index) => {
      const pair = pairOf.get(pairKey(studentId, jdId));
      if (!pair) throw new Error(`engine nominated ${studentId} to ${jdId}, which is not a ranked pair`);
      return {
        roundId,
        campaignId,
        studentId: Number(studentId),
        jdId: Number(jdId),
        preferenceId: pair.preferenceId,
        sFinal: pair.rankKey.sFinal / 100,
        rank: index + 1,
        overrideReason: null,
      };
    }),
  );
}
